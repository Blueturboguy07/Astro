/**
 * Astro 0.2.4 QA, F-088: SearXNG's unresponsive_engines were dropped, so an
 * empty answer could not say which engines failed or why.
 */
import { describe, expect, it } from 'bun:test'
import {
  readUnresponsive,
  SearchReport,
  searchFailureToShow,
} from '../../../src/lib/simplicity/search-report'

describe('readUnresponsive', () => {
  it('reads [name, reason] pairs', () => {
    expect(
      readUnresponsive([
        ['duckduckgo', 'CAPTCHA'],
        ['brave', 'too many requests'],
      ]),
    ).toEqual([
      { engine: 'duckduckgo', reason: 'CAPTCHA' },
      { engine: 'brave', reason: 'too many requests' },
    ])
  })

  it('gives a reason when SearXNG sends none', () => {
    expect(readUnresponsive([['qwant', ''], ['mojeek']])).toEqual([
      { engine: 'qwant', reason: 'no answer' },
      { engine: 'mojeek', reason: 'no answer' },
    ])
  })

  it('ignores what is not a list of pairs', () => {
    expect(readUnresponsive(undefined)).toEqual([])
    expect(readUnresponsive({ duckduckgo: 'CAPTCHA' })).toEqual([])
    expect(readUnresponsive([42, [null, 'x'], ['  ', 'x']])).toEqual([])
  })

  it('shortens a very long reason', () => {
    const [e] = readUnresponsive([['bing', 'x'.repeat(500)]])
    expect(e.reason.length).toBe(120)
    expect(e.reason.endsWith('…')).toBe(true)
  })
})

describe('SearchReport', () => {
  it('keeps the first reason for each engine and every distinct error', () => {
    const r = new SearchReport()
    r.noteEngines([{ engine: 'duckduckgo', reason: 'CAPTCHA' }])
    r.noteEngines([
      { engine: 'duckduckgo', reason: 'timeout' },
      { engine: 'brave', reason: 'too many requests' },
    ])
    r.noteError(new Error('SearXNG search timed out'))
    r.noteError(new Error('SearXNG search timed out'))
    r.noteError('The local search engine could not start')
    expect(r.failure()).toEqual({
      engines: [
        { engine: 'duckduckgo', reason: 'CAPTCHA' },
        { engine: 'brave', reason: 'too many requests' },
      ],
      errors: [
        'SearXNG search timed out',
        'The local search engine could not start',
      ],
    })
  })

  it('counts usable hits and carries the fallback note', () => {
    const r = new SearchReport()
    expect(r.usable).toBe(0)
    r.noteUsable(0)
    r.noteUsable(3)
    expect(r.usable).toBe(3)
    r.noteFallback('publik web search found no results ($0.01).')
    expect(r.failure().fallback).toBe(
      'publik web search found no results ($0.01).',
    )
  })
})

describe('searchFailureToShow', () => {
  const failure = { engines: [], errors: [] }

  it('shows the failure when there is nothing to write from', () => {
    expect(searchFailureToShow({ searchFailed: failure }, 0)).toBe(failure)
  })

  it('keeps the writer when search found sources', () => {
    expect(searchFailureToShow({}, 0)).toBeNull()
    expect(searchFailureToShow(null, 0)).toBeNull()
  })

  it('keeps the writer when a widget answered', () => {
    expect(searchFailureToShow({ searchFailed: failure }, 1)).toBeNull()
  })

  it('shows nothing for a stopped turn', () => {
    const stop = new AbortController()
    stop.abort()
    expect(
      searchFailureToShow({ searchFailed: failure }, 0, stop.signal),
    ).toBeNull()
  })
})
