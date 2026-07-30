/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from Simplicity (~/Vane src/lib/agents/search/researcher/queryPlanner.ts),
 * MIT (c) ItzCrazyKns. Rewired from its BaseLLM/generateObjectWithRetry helpers
 * onto the AI SDK's generateObject.
 *
 * Search queries are planned by code, not chosen by the answering model.
 * Retrieval always happens once research starts — the only thing the model
 * contributes is WHAT to search for, and even that has a deterministic fallback
 * (the question verbatim), so a misbehaving model can degrade query quality but
 * can never zero out retrieval.
 */

import { generateObject, type LanguageModel } from 'ai'
import { z } from 'zod'
import { logger } from '../../lib/logger'

const planSchema = z.object({
  plan: z
    .string()
    .describe(
      "One short present-participle phrase describing what is being researched, e.g. 'Researching current Tesla stock performance'. No trailing period.",
    ),
  queries: z
    .array(z.string())
    .describe(
      'Search-engine queries: short, keyword-style, SEO-friendly. Each query targets a different aspect of the question.',
    ),
})

const refineSchema = z.object({
  sufficient: z
    .boolean()
    .describe(
      'true if the results gathered so far can fully answer the question; false if important aspects are still uncovered.',
    ),
  plan: z
    .string()
    .describe(
      "One short present-participle phrase describing the follow-up angle, e.g. 'Digging into Q2 earnings details'.",
    ),
  queries: z
    .array(z.string())
    .describe(
      'Follow-up queries covering what is still missing. Empty if sufficient.',
    ),
})

export interface QueryPlan {
  plan: string
  queries: string[]
}

const MAX_REFINE_QUERIES = 3

function plannerPrompt(queryCount: number): string {
  return `You plan web searches for an answer engine. Today's date is ${new Date().toDateString()} — use the CURRENT year in time-sensitive queries, never a stale one. Given the user's question, produce up to ${queryCount} search-engine queries that together cover it.

Rules:
- Queries are keywords, not sentences: "GPT-5.1 release date", not "When was GPT-5.1 released?".
- Split distinct aspects into distinct queries instead of one broad query.
- Include a year or "latest" when freshness matters.
- Keep entity names exactly as the user wrote them.
- Also produce a one-line "plan": a short present-participle phrase describing the research direction.`
}

function refinerPrompt(): string {
  return `You review interim web-search results for an answer engine and decide whether another round of searching is needed. Today's date is ${new Date().toDateString()}.

You are given the user's question, the queries already run, and the titles of results found so far. Decide:
- "sufficient": can the question be fully answered from these results? Be strict about coverage — if a distinct aspect of the question has no matching results, it is not sufficient.
- If not sufficient, produce up to ${MAX_REFINE_QUERIES} NEW queries targeting only what is missing. Never repeat or trivially rephrase queries that were already run.`
}

function cleanQueries(queries: string[] | undefined, limit: number): string[] {
  return (queries ?? [])
    .filter((q) => typeof q === 'string' && q.trim().length > 0)
    .map((q) => q.trim())
    .slice(0, limit)
}

export async function planQueries(input: {
  model: LanguageModel
  question: string
  queryCount: number
}): Promise<QueryPlan> {
  try {
    const { object } = await generateObject({
      model: input.model,
      schema: planSchema,
      messages: [
        { role: 'system', content: plannerPrompt(input.queryCount) },
        { role: 'user', content: `<question>${input.question}</question>` },
      ],
    })

    const queries = cleanQueries(object.queries, input.queryCount)
    if (queries.length > 0) {
      return {
        plan: object.plan || `Searching for ${input.question}`,
        queries,
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn(
      `Query planning failed, falling back to raw question: ${message}`,
    )
  }

  /* The guarantee: planning can fail, searching still happens. */
  return {
    plan: `Searching for ${input.question}`,
    queries: [input.question],
  }
}

/** Returns null when coverage is judged sufficient or refinement fails. */
export async function refineQueries(input: {
  model: LanguageModel
  question: string
  previousQueries: string[]
  resultTitles: string[]
}): Promise<QueryPlan | null> {
  try {
    const { object } = await generateObject({
      model: input.model,
      schema: refineSchema,
      messages: [
        { role: 'system', content: refinerPrompt() },
        {
          role: 'user',
          content: `<question>${input.question}</question>\n<queries_already_run>\n${input.previousQueries.join('\n')}\n</queries_already_run>\n<result_titles>\n${input.resultTitles.slice(0, 30).join('\n')}\n</result_titles>`,
        },
      ],
    })

    if (object.sufficient) return null

    const queries = cleanQueries(object.queries, MAX_REFINE_QUERIES).filter(
      (q) => !input.previousQueries.includes(q),
    )
    if (queries.length === 0) return null

    return { plan: object.plan || 'Digging deeper', queries }
  } catch (error) {
    /* Refinement is best-effort — round one already produced results. */
    const message = error instanceof Error ? error.message : String(error)
    logger.warn(
      `Query refinement failed, stopping after current round: ${message}`,
    )
    return null
  }
}
