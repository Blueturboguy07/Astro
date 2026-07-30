/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Keyless web search backed by the locally provisioned SearXNG instance.
 *
 * Closes the retrieval gap: before this the agent had no search primitive at
 * all and had to navigate to a search engine and scrape the results page.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { logger } from '../../lib/logger'
import { searchSearxng } from '../../lib/searxng/search'

const DEFAULT_LIMIT = 8
const MAX_LIMIT = 20
const MAX_SNIPPET_CHARS = 400

/* SearXNG category names, not free text — anything else makes it return 0
   results rather than erroring, which reads to the model as "nothing exists". */
const CATEGORIES = ['general', 'news', 'science', 'it'] as const

function truncate(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed
}

export function createWebSearchTool() {
  return tool({
    description:
      'Search the web and get back ranked results with titles, URLs and snippets. Use this to find information rather than navigating to a search engine and reading the results page. Runs against a local search instance, so it needs no API key and sends no query to a third-party account.',
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'Search keywords. Prefer short, targeted, SEO-style keywords over full sentences.',
        ),
      category: z
        .enum(CATEGORIES)
        .optional()
        .describe('Result category (default: general).'),
      limit: z
        .number()
        .optional()
        .describe(`Maximum results to return (default: ${DEFAULT_LIMIT}).`),
    }),
    execute: async (params) => {
      const limit = Math.min(
        Math.max(1, params.limit ?? DEFAULT_LIMIT),
        MAX_LIMIT,
      )

      try {
        const { results, suggestions } = await searchSearxng(params.query, {
          categories: params.category ? [params.category] : undefined,
        })

        if (results.length === 0) {
          const hint = suggestions.length
            ? ` Did you mean: ${suggestions.slice(0, 3).join(', ')}?`
            : ''
          return { text: `No results for "${params.query}".${hint}` }
        }

        /* Numbered so the model can cite a specific result, with the URL on its
           own line so citations survive snippet truncation. */
        const formatted = results
          .slice(0, limit)
          .map((r, i) => {
            const snippet = r.content
              ? `\n   ${truncate(r.content, MAX_SNIPPET_CHARS)}`
              : ''
            return `${i + 1}. ${r.title}\n   ${r.url}${snippet}`
          })
          .join('\n\n')

        return {
          text: `${results.length} results for "${params.query}" (showing ${Math.min(limit, results.length)}):\n\n${formatted}`,
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown search error'
        logger.error(`web_search failed: ${message}`)
        return { text: `Search failed: ${message}`, isError: true }
      }
    },
  })
}
