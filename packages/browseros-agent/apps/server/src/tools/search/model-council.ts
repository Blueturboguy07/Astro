/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Model Council — fan one question out to several models, then compare.
 *
 * Ported from Simplicity (~/Vane src/lib/agents/council), MIT (c) ItzCrazyKns.
 *
 * Vane's load-bearing design decision is kept: retrieval runs EXACTLY ONCE and
 * every member answers from that identical context. Perplexity fans the prompt
 * out to N models that each run their own pipeline behind a flat subscription
 * fee; here each call is really billed, so sharing the context is what keeps
 * cost at N writers instead of N pipelines — and it is also what makes the
 * comparison apples-to-apples, since members differ only by model.
 *
 * Departure from upstream: Vane selects members across providers from its own
 * catalog. BrowserOS resolves credentials per-session on ResolvedAgentConfig,
 * so a tool can only reach the provider the session is already authenticated
 * against. Members are therefore different MODELS on the current provider.
 * Cross-provider councils need provider configs plumbed into the agent first.
 */

import { generateText, type LanguageModel, tool } from 'ai'
import { z } from 'zod'
import { createLanguageModel } from '../../agent/provider-factory'
import type { ResolvedAgentConfig } from '../../agent/types'
import { logger } from '../../lib/logger'

const MAX_MEMBERS = 4
const MIN_MEMBERS = 2

interface MemberAnswer {
  name: string
  answer: string
}

function getChairPrompt(
  query: string,
  context: string,
  members: MemberAnswer[],
): string {
  return `You are the CHAIR of a Model Council. ${members.length} independent models were each given the exact same context below and asked to answer the same question. Your job is to COMPARE their answers — not to silently merge, average, or pick a "majority" answer and discard the rest. Surface disagreement; don't hide it.

Structure your response using these Markdown sections, in this exact order:

1. An unlabelled opening of one to three paragraphs giving the single best synthesized verdict to the user's question — the answer a careful reader should walk away believing. Cite sources inline with [number] notation exactly as a normal answer would.
2. "## Convergence" — bullet points listing the claims where the council members agreed with each other.
3. "## Divergence" — bullet points for each point of disagreement, explicitly naming which model took which position (for example: "**gpt-5.4** said X, while **claude-opus-5** said Y"). If the members substantially agree on everything, keep this section to one line saying so plainly rather than inventing a disagreement.
4. "## Unique insights" — bullet points for anything only a single model raised that is still worth surfacing, naming that model.

If a section would otherwise be empty, still include its heading with a one-line note (e.g. "No meaningful divergence found.") rather than omitting the heading.

### Citation requirements
- Cite every fact in the opening verdict using [number] notation against the context below.
- Never cite unsupported assumptions or personal interpretations.

<context>
${context}
</context>

<council_member_answers>
${members.map((m) => `<answer model="${m.name}">\n${m.answer}\n</answer>`).join('\n\n')}
</council_member_answers>

<user_query>${query}</user_query>

Current date & time in ISO format (UTC timezone) is: ${new Date().toISOString()}.`
}

const MEMBER_PROMPT = `You are one member of a model council. Answer the user's question using ONLY the context provided. Cite sources inline with [number] notation. Be direct and specific; state uncertainty plainly rather than hedging everywhere. Another model will compare your answer against other members', so answer independently — do not hedge toward a consensus you cannot see.`

export function createModelCouncilTool(
  resolvedConfig: ResolvedAgentConfig,
  chairModel: LanguageModel,
) {
  return tool({
    description:
      'Ask several models the same question against one shared body of context, then compare their answers — surfacing agreement, disagreement, and points only one model raised. Use when a question is contested, high-stakes, or benefits from more than one perspective. Members are different models on the currently configured provider. Costs one call per member plus one chair call.',
    inputSchema: z.object({
      question: z.string().describe('The question to put to the council.'),
      context: z
        .string()
        .describe(
          'The shared source material every member answers from — for example the FINDINGS block returned by deep_research. Include [n] markers so members can cite them.',
        ),
      models: z
        .array(z.string())
        .describe(
          `Model IDs to consult on the current provider, e.g. ["gpt-5.4","gpt-5.2"]. Between ${MIN_MEMBERS} and ${MAX_MEMBERS}.`,
        ),
    }),
    execute: async (params) => {
      const models = [...new Set(params.models)].slice(0, MAX_MEMBERS)
      if (models.length < MIN_MEMBERS) {
        return {
          text: `A council needs at least ${MIN_MEMBERS} distinct models; got ${models.length}.`,
          isError: true,
        }
      }

      const answers = await Promise.all(
        models.map(async (name): Promise<MemberAnswer | null> => {
          try {
            /* Same session credentials, different model — see the header note
               on why members cannot span providers today. */
            const { model, close } = await createLanguageModel({
              ...resolvedConfig,
              model: name,
            })
            try {
              const { text } = await generateText({
                model,
                messages: [
                  { role: 'system', content: MEMBER_PROMPT },
                  {
                    role: 'user',
                    content: `<context>\n${params.context}\n</context>\n\n<question>${params.question}</question>`,
                  },
                ],
              })
              return { name, answer: text }
            } finally {
              await close?.()
            }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error)
            logger.warn(`Council member ${name} failed: ${message}`)
            return null
          }
        }),
      )

      const seated = answers.filter((a): a is MemberAnswer => a !== null)
      if (seated.length < MIN_MEMBERS) {
        return {
          text: `Only ${seated.length} of ${models.length} council members answered, which is too few to compare. Check that the model IDs are valid for the configured provider.`,
          isError: true,
        }
      }

      const { text } = await generateText({
        model: chairModel,
        messages: [
          {
            role: 'system',
            content: getChairPrompt(params.question, params.context, seated),
          },
          { role: 'user', content: params.question },
        ],
      })

      const dropped = models.length - seated.length
      const note =
        dropped > 0 ? `\n\n(${dropped} member(s) failed to answer.)` : ''
      return { text: `${text}${note}` }
    },
  })
}
