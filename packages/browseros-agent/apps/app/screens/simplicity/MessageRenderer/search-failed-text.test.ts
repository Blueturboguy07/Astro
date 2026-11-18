/**
 * Astro 0.2.4 QA, F-088: the "Web search failed" card says which engines
 * did not answer and why, instead of an answer that "could not find" it.
 */
import { describe, expect, it } from 'bun:test'
import { searchFailedText } from './search-failed-text'

const FOOTER =
  'Astro did not write an answer without web sources. Press Retry to search again.'

describe('searchFailedText', () => {
  it('lists each engine with its reason', () => {
    expect(
      searchFailedText({
        engines: [
          { engine: 'duckduckgo', reason: 'CAPTCHA' },
          { engine: 'brave', reason: 'too many requests' },
        ],
        errors: [],
      }),
    ).toEqual({
      title: 'Web search failed',
      intro: 'These search engines did not answer:',
      lines: ['duckduckgo: CAPTCHA', 'brave: too many requests'],
      footer: FOOTER,
    })
  })

  it('adds errors and the publik fallback result', () => {
    const t = searchFailedText({
      engines: [{ engine: 'qwant', reason: 'access denied' }],
      errors: ['SearXNG search timed out'],
      fallback:
        'publik web search also failed: not enough publik balance (HTTP 402). Nothing was charged.',
    })
    expect(t.lines).toEqual(['qwant: access denied', 'SearXNG search timed out'])
    expect(t.fallback).toBe(
      'publik web search also failed: not enough publik balance (HTTP 402). Nothing was charged.',
    )
  })

  it('says the search gave an error when no engine is named', () => {
    const t = searchFailedText({
      engines: [],
      errors: ['The local search engine could not start'],
    })
    expect(t.intro).toBe('The web search gave an error:')
    expect(t.lines).toEqual(['The local search engine could not start'])
  })

  it('says no result matched when every engine answered', () => {
    const t = searchFailedText({ engines: [], errors: [] })
    expect(t.intro).toBe(
      'The search engines answered, but no result matched the question.',
    )
    expect(t.lines).toEqual([])
    expect(t.fallback).toBeUndefined()
  })

  it('still says what it can for a partial block', () => {
    expect(searchFailedText(undefined).title).toBe('Web search failed')
    expect(searchFailedText({ fallback: '  ' }).fallback).toBeUndefined()
  })
})
