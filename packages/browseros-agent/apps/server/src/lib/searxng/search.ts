/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * SearXNG JSON API client.
 *
 * Ported from Simplicity (~/Vane src/lib/searxng.ts), MIT (c) ItzCrazyKns.
 * The upstream resolved its URL from a config registry; here it comes from the
 * locally provisioned instance in provision.ts.
 */

import { getRunningURL, start } from './provision'

const SEARCH_TIMEOUT_MS = 10_000

export interface SearxngSearchOptions {
  categories?: string[]
  engines?: string[]
  language?: string
  pageno?: number
}

export interface SearxngSearchResult {
  title: string
  url: string
  img_src?: string
  thumbnail_src?: string
  thumbnail?: string
  content?: string
  author?: string
  iframe_src?: string
}

export interface SearxngResponse {
  results: SearxngSearchResult[]
  suggestions: string[]
}

export async function searchSearxng(
  query: string,
  opts?: SearxngSearchOptions,
): Promise<SearxngResponse> {
  /* start() is idempotent and returns immediately once the instance answers,
     so callers never have to sequence provisioning themselves. */
  const searxngURL = getRunningURL() ?? (await start())

  const url = new URL(`${searxngURL}/search?format=json`)
  url.searchParams.append('q', query)

  if (opts) {
    for (const key of Object.keys(opts)) {
      const value = opts[key as keyof SearxngSearchOptions]
      if (value === undefined) continue
      if (Array.isArray(value)) {
        url.searchParams.append(key, value.join(','))
        continue
      }
      url.searchParams.append(key, String(value))
    }
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    })

    if (!res.ok) {
      throw new Error(`SearXNG error: ${res.statusText}`)
    }

    const data = (await res.json()) as Partial<SearxngResponse>

    return {
      results: data.results ?? [],
      suggestions: data.suggestions ?? [],
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error('SearXNG search timed out')
    }
    throw err
  }
}
