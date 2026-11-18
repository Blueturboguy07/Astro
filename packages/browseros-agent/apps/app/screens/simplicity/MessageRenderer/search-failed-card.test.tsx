import { describe, expect, it } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import SearchFailedCard from './SearchFailedCard'

/* Astro 0.2.4 QA, F-088: the card shown instead of an answer when web
   search gave nothing to write from. */
describe('SearchFailedCard', () => {
  it('names the failed engines, the publik result and offers Retry', () => {
    const html = renderToStaticMarkup(
      createElement(SearchFailedCard, {
        block: {
          id: 'b1',
          type: 'searchFailed',
          data: {
            engines: [
              { engine: 'duckduckgo', reason: 'CAPTCHA' },
              { engine: 'brave', reason: 'too many requests' },
            ],
            errors: [],
            fallback:
              'publik web search also failed: publik search is busy (HTTP 503). Nothing was charged.',
          },
        },
        onRetry: () => {},
      }),
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('Web search failed')
    expect(html).toContain('These search engines did not answer:')
    expect(html).toContain('<li class="break-words">duckduckgo: CAPTCHA</li>')
    expect(html).toContain('brave: too many requests')
    expect(html).toContain('publik search is busy (HTTP 503)')
    expect(html).toContain(
      'Astro did not write an answer without web sources. Press Retry to search again.',
    )
    expect(html).toContain('>Retry</button>')
  })
})
