/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Multi-step research loop.
 *
 * Ported from Simplicity (~/Vane src/lib/agents/search/researcher), MIT
 * (c) ItzCrazyKns, reshaped into a single AI SDK tool.
 *
 * Two deliberate departures from the upstream:
 *
 *  1. No embedding rerank. Vane embeds the query and every result chunk and
 *     sorts by cosine similarity. BrowserOS configures no embedding model and
 *     is BYO-key, so requiring one would gate research behind a second
 *     credential. Ranking is left to SearXNG's own fusion across engines, then
 *     narrowed by the model-driven picker below — which is the step that
 *     actually decides what gets read.
 *  2. Dedupe is by normalized URL rather than by embedding similarity, for the
 *     same reason. Near-duplicate articles on different domains survive; exact
 *     re-finds across rounds do not.
 */

import { generateObject, type LanguageModel, tool } from 'ai'
import { z } from 'zod'
import { logger } from '../../lib/logger'
import { scrape } from '../../lib/scraper'
import {
  type SearxngSearchResult,
  searchSearxng,
} from '../../lib/searxng/search'
import { planQueries, refineQueries } from './query-planner'

/* Rounds are what separates the depth modes: every round is one plan/search/read
   pass, and refineQueries decides whether another is warranted. */
const MODE_ROUNDS = { speed: 1, balanced: 2, deep: 3 } as const
const MODE_QUERIES = { speed: 3, balanced: 3, deep: 4 } as const
const MODE_READS = { speed: 2, balanced: 3, deep: 4 } as const

type ResearchMode = keyof typeof MODE_ROUNDS

const MAX_EXTRACT_CHARS = 12_000
const MAX_FACT_CHARS = 1_500
const RESULTS_PER_QUERY = 8

interface Source {
  index: number
  title: string
  url: string
  snippet: string
  facts?: string
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    /* Trailing slashes and utm_* params make the same article look like several
       distinct results across rounds. */
    u.search = ''
    return `${u.origin}${u.pathname.replace(/\/$/, '')}`
  } catch {
    return url
  }
}

const pickSchema = z.object({
  indices: z
    .array(z.number())
    .describe(
      'Indices of the results most worth reading in full, most relevant first.',
    ),
})

/** Model-driven narrowing: which results are worth the cost of fetching. */
async function pickResultsToRead(
  model: LanguageModel,
  question: string,
  sources: Source[],
  limit: number,
): Promise<Source[]> {
  if (sources.length <= limit) return sources

  try {
    const listing = sources
      .map((s) => `${s.index}. ${s.title} — ${s.url}\n   ${s.snippet}`)
      .join('\n')

    const { object } = await generateObject({
      model,
      schema: pickSchema,
      messages: [
        {
          role: 'system',
          content: `You pick which search results are worth reading in full to answer a question. Choose at most ${limit}. Prefer primary sources, official documentation and substantive articles over aggregators, SEO listicles and duplicates. Return only indices from the provided list.`,
        },
        {
          role: 'user',
          content: `<question>${question}</question>\n<results>\n${listing}\n</results>`,
        },
      ],
    })

    const byIndex = new Map(sources.map((s) => [s.index, s]))
    const picked = object.indices
      .map((i) => byIndex.get(i))
      .filter((s): s is Source => s !== undefined)
      .slice(0, limit)

    if (picked.length > 0) return picked
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn(
      `Result picking failed, falling back to top results: ${message}`,
    )
  }

  /* Same guarantee as the planner: a failed pick degrades ordering, it never
     stops the read step. */
  return sources.slice(0, limit)
}

/** Pulls only the question-relevant facts out of a scraped page. */
async function extractFacts(
  model: LanguageModel,
  question: string,
  source: Source,
  content: string,
): Promise<string | undefined> {
  try {
    const { object } = await generateObject({
      model,
      schema: z.object({
        facts: z
          .string()
          .describe(
            'The facts from this page that bear on the question, as terse bullet points. Empty string if the page says nothing relevant.',
          ),
      }),
      messages: [
        {
          role: 'system',
          content:
            'You extract facts from a scraped web page. Keep only what bears on the question. Ignore navigation, headers, footers and boilerplate. Preserve concrete figures, dates and names verbatim. Do not speculate or add anything not present in the page.',
        },
        {
          role: 'user',
          content: `<question>${question}</question>\n<page url="${source.url}">\n${content.slice(0, MAX_EXTRACT_CHARS)}\n</page>`,
        },
      ],
    })
    const facts = object.facts.trim()
    return facts.length > 0 ? facts.slice(0, MAX_FACT_CHARS) : undefined
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn(`Fact extraction failed for ${source.url}: ${message}`)
    return undefined
  }
}

function toSources(
  results: SearxngSearchResult[],
  seen: Set<string>,
  startIndex: number,
): Source[] {
  const fresh: Source[] = []
  for (const r of results) {
    const key = normalizeUrl(r.url)
    if (seen.has(key)) continue
    seen.add(key)
    fresh.push({
      index: startIndex + fresh.length + 1,
      title: r.title,
      url: r.url,
      snippet: (r.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 300),
    })
  }
  return fresh
}

export function createDeepResearchTool(model: LanguageModel) {
  return tool({
    description:
      'Research a question across many web sources and return organized findings with numbered citations. Runs several rounds of planned searches, reads the most relevant pages in full, and extracts the facts that bear on the question. Use for questions needing synthesis across sources; use web_search for a single quick lookup.',
    inputSchema: z.object({
      question: z
        .string()
        .describe(
          'The research question, as a full natural-language question.',
        ),
      mode: z
        .enum(['speed', 'balanced', 'deep'])
        .optional()
        .describe(
          'speed = 1 round, balanced = up to 2, deep = up to 3. Default balanced.',
        ),
    }),
    execute: async (params) => {
      const mode: ResearchMode = params.mode ?? 'balanced'
      const maxRounds = MODE_ROUNDS[mode]
      const seenUrls = new Set<string>()
      const allSources: Source[] = []
      const ranQueries: string[] = []
      const plans: string[] = []

      let plan: Awaited<ReturnType<typeof planQueries>> | null =
        await planQueries({
          model,
          question: params.question,
          queryCount: MODE_QUERIES[mode],
        })

      for (let round = 0; round < maxRounds && plan; round++) {
        plans.push(plan.plan)
        ranQueries.push(...plan.queries)

        const batches = await Promise.all(
          plan.queries.map((q) =>
            searchSearxng(q).catch((error) => {
              logger.warn(`Search failed for "${q}": ${error}`)
              return { results: [], suggestions: [] }
            }),
          ),
        )

        const fresh = toSources(
          batches.flatMap((b) => b.results.slice(0, RESULTS_PER_QUERY)),
          seenUrls,
          allSources.length,
        )
        allSources.push(...fresh)

        if (fresh.length > 0) {
          const toRead = await pickResultsToRead(
            model,
            params.question,
            fresh,
            MODE_READS[mode],
          )

          await Promise.all(
            toRead.map(async (source) => {
              const page = await scrape(source.url)
              if (!page.ok) return
              source.facts = await extractFacts(
                model,
                params.question,
                source,
                page.content,
              )
            }),
          )
        }

        const isLastRound = round === maxRounds - 1
        plan = isLastRound
          ? null
          : await refineQueries({
              model,
              question: params.question,
              previousQueries: ranQueries,
              resultTitles: allSources.map((s) => s.title),
            })
      }

      if (allSources.length === 0) {
        return { text: `No sources found for "${params.question}".` }
      }

      const withFacts = allSources.filter((s) => s.facts)
      const findings = withFacts
        .map((s) => `[${s.index}] ${s.title}\n${s.url}\n${s.facts}`)
        .join('\n\n')
      const remaining = allSources
        .filter((s) => !s.facts)
        .map((s) => `[${s.index}] ${s.title} — ${s.url}`)
        .join('\n')

      const header = `Researched "${params.question}" (${mode}, ${plans.length} round${plans.length === 1 ? '' : 's'}, ${ranQueries.length} queries, ${allSources.length} sources, ${withFacts.length} read in full).`

      return {
        text: [
          header,
          plans.length ? `\nPlan: ${plans.join(' → ')}` : '',
          withFacts.length ? `\n\nFINDINGS\n\n${findings}` : '',
          remaining ? `\n\nOTHER SOURCES (not read)\n${remaining}` : '',
          '\n\nCite sources by their [n] index.',
        ].join(''),
      }
    },
  })
}
