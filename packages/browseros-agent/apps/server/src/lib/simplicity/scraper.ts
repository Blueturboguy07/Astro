/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Shim preserving Simplicity's `Scraper.scrape()` interface (~/Vane
 * src/lib/scraper.ts, MIT (c) ItzCrazyKns) on top of BrowserOS's scraper.
 *
 * The upstream launched a headless Playwright Chromium per scrape and kept a
 * pooled browser alive with an idle-kill timer. That is the wrong trade inside a
 * browser: it ships a second engine (~500MB) to render pages this process can
 * already reach. `../scraper` does a plain fetch plus Readability instead, so
 * the pooling and lifecycle management are unnecessary here.
 *
 * The known cost: pages that render their body in JS come back thin. The agent
 * should navigate and use the CDP-backed `read` tool for those.
 */

import { scrape as fetchAndExtract } from '../scraper'

class Scraper {
  static async scrape(
    url: string,
  ): Promise<{ content: string; title: string }> {
    const page = await fetchAndExtract(url)

    if (!page.ok) {
      return {
        title: 'Failed to scrape',
        content: `# ${url}\n\nError scraping content.`,
      }
    }

    /* Upstream returned the title and URL as a markdown heading above the body
       and callers rely on that shape. */
    return {
      title: page.title,
      content: `# ${page.title} - ${url}\n${page.content}`,
    }
  }
}

export default Scraper
