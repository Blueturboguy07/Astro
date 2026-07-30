/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Article extraction for server-side research.
 *
 * Adapted from Simplicity (~/Vane src/lib/scraper.ts), MIT (c) ItzCrazyKns.
 * The upstream launched a headless Playwright Chromium per scrape. That is the
 * wrong trade here: BrowserOS already IS a browser, so shipping a second engine
 * inside it costs ~500MB to render pages the agent can already reach. This does
 * a plain fetch and hands the HTML to Readability instead.
 *
 * The cost of that choice: pages that render their body in JS come back thin.
 * When that matters the agent should navigate and use the CDP-backed `read`
 * tool, which sees the live DOM.
 */

import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import { logger } from './logger'

const FETCH_TIMEOUT_MS = 15_000
const MAX_HTML_BYTES = 5_000_000

/* A stock desktop UA. Sites routinely serve degraded or empty markup to
   unknown agents, which reads downstream as "the page had no content". */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'

export interface ScrapedPage {
  url: string
  title: string
  content: string
  ok: boolean
}

function failure(url: string, reason: string): ScrapedPage {
  logger.debug(`scrape skipped ${url}: ${reason}`)
  return {
    url,
    title: 'Failed to fetch',
    content: '',
    ok: false,
  }
}

/** Fetches a URL and extracts its readable article text. Never throws. */
export async function scrape(url: string): Promise<ScrapedPage> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return failure(url, 'invalid url')
  }
  /* Only ever speak HTTP. A file:// or data: URL reaching this from a search
     result would read local disk into the model's context. */
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return failure(url, 'unsupported protocol')
  }

  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    })

    if (!res.ok) return failure(url, `http ${res.status}`)

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('html') && !contentType.includes('text')) {
      return failure(url, `unsupported content-type ${contentType}`)
    }

    const html = await res.text()
    if (html.length > MAX_HTML_BYTES) {
      return failure(url, 'document too large')
    }

    /* linkedom rather than jsdom: jsdom loads runtime JSON data files that Bun's
       --compile cannot bundle, which breaks the packaged server binary
       ("Cannot find module '../data/patch.json'"). linkedom is pure JS.

       It also has no concept of a document URL, and Readability needs one to
       resolve relative hrefs, so inject a <base> before parsing. */
    const withBase = html.includes('<base')
      ? html
      : html.replace(/<head([^>]*)>/i, `<head$1><base href="${parsed.href}">`)
    const { document } = parseHTML(withBase)
    const article = new Readability(document as never).parse()
    const title = article?.title || document.title || url
    const text = article?.textContent?.trim() ?? ''

    if (!text) return failure(url, 'no extractable content')

    return { url, title, content: text, ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn(`scrape failed for ${url}: ${message}`)
    return failure(url, message)
  }
}
