/**
 * Astro 0.2.4 QA, F-088: the publik search line as the fallback when the
 * local SearXNG gives nothing. fetch is stubbed: no call reaches publik.
 */
import { describe, expect, it } from 'bun:test'
import {
  publikSearchAccess,
  searchPublik,
} from '../../../src/lib/simplicity/publik-search'

const KEY = 'pk_test_not_a_real_key'
const access = { baseURL: 'https://publikhq.com/api/v1', apiKey: KEY }

type Call = { url: string; init: RequestInit }

const stubFetch = (respond: (call: Call) => Response | Promise<Response>) => {
  const calls: Call[] = []
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} }
    calls.push(call)
    return respond(call)
  }) as typeof fetch
  return { impl, calls }
}

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

describe('publikSearchAccess', () => {
  const provider = (over: Record<string, unknown> = {}) => ({
    type: 'openai',
    name: 'publik API',
    config: { baseURL: 'https://publikhq.com/api/v1/', apiKey: KEY },
    ...over,
  })

  it('reads the base URL and key of the publik connection', () => {
    expect(publikSearchAccess(provider())).toEqual(access)
  })

  it('knows publik by its host when the name was changed', () => {
    expect(publikSearchAccess(provider({ name: 'My gateway' }))).toEqual(access)
  })

  it('knows publik by its name for a development base URL', () => {
    expect(
      publikSearchAccess(
        provider({
          config: { baseURL: 'http://localhost:3000/api/v1', apiKey: KEY },
        }),
      ),
    ).toEqual({ baseURL: 'http://localhost:3000/api/v1', apiKey: KEY })
  })

  it('refuses other connections and connections without a key', () => {
    expect(publikSearchAccess(undefined)).toBeUndefined()
    expect(
      publikSearchAccess(
        provider({
          name: 'OpenAI',
          config: { baseURL: 'https://api.openai.com/v1', apiKey: 'sk-x' },
        }),
      ),
    ).toBeUndefined()
    expect(publikSearchAccess(provider({ type: 'anthropic' }))).toBeUndefined()
    expect(
      publikSearchAccess(
        provider({ config: { baseURL: 'https://publikhq.com/api/v1' } }),
      ),
    ).toBeUndefined()
  })
})

describe('searchPublik', () => {
  it('posts the query with the key and maps the results', async () => {
    const { impl, calls } = stubFetch(() =>
      json(
        {
          object: 'search.results',
          query: 'rivers in australia',
          count: 2,
          more: false,
          results: [
            {
              url: 'https://en.wikipedia.org/wiki/Murray_River',
              title: 'Murray River',
              snippet: 'The longest river in Australia.',
              site: 'en.wikipedia.org',
              age: null,
            },
            { url: 'https://example.org/a', title: '', snippet: '' },
            { title: 'no url' },
          ],
          charge_micros: 10000,
          request_id: 'req_1',
        },
        200,
        { 'x-publik-charge-micros': '10000' },
      ),
    )

    const out = await searchPublik(access, '  rivers in australia ', {
      fetchImpl: impl,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://publikhq.com/api/v1/search')
    expect(calls[0].init.method).toBe('POST')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.authorization).toBe(`Bearer ${KEY}`)
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      q: 'rivers in australia',
      count: 10,
    })
    expect(out).toEqual({
      ok: true,
      chargeMicros: 10000,
      hits: [
        {
          title: 'Murray River',
          url: 'https://en.wikipedia.org/wiki/Murray_River',
          content: 'The longest river in Australia.',
        },
        {
          title: 'https://example.org/a',
          url: 'https://example.org/a',
          content: 'https://example.org/a',
        },
      ],
    })
  })

  it('reads the charge from the body when the header is missing', async () => {
    const { impl } = stubFetch(() =>
      json({ results: [], charge_micros: 10000 }),
    )
    const out = await searchPublik(access, 'q', { fetchImpl: impl })
    expect(out).toEqual({ ok: true, hits: [], chargeMicros: 10000 })
  })

  it('caps the query at 400 characters', async () => {
    const { impl, calls } = stubFetch(() => json({ results: [] }))
    await searchPublik(access, 'a'.repeat(1000), { fetchImpl: impl })
    expect(JSON.parse(String(calls[0].init.body)).q).toHaveLength(400)
  })

  const errors: [number, string][] = [
    [
      400,
      'the search request was not accepted (HTTP 400). Nothing was charged',
    ],
    [401, 'the publik key was not accepted (HTTP 401). Nothing was charged'],
    [402, 'not enough publik balance (HTTP 402). Nothing was charged'],
    [
      429,
      'publik search is busy or the daily limit is reached (HTTP 429). Nothing was charged',
    ],
    [502, 'the search supplier gave an error (HTTP 502). Nothing was charged'],
    [503, 'publik search is busy (HTTP 503). Nothing was charged'],
    [504, 'publik search timed out (HTTP 504). Nothing was charged'],
    [500, 'publik search gave an error (HTTP 500). Nothing was charged'],
  ]
  for (const [status, reason] of errors) {
    it(`says what HTTP ${status} means`, async () => {
      const { impl } = stubFetch(() =>
        json({ error: { message: 'x', type: 'y' } }, status),
      )
      expect(await searchPublik(access, 'q', { fetchImpl: impl })).toEqual({
        ok: false,
        reason,
      })
    })
  }

  it('reports a network failure without claiming nothing was charged', async () => {
    const { impl } = stubFetch(() => {
      throw new TypeError('fetch failed')
    })
    expect(await searchPublik(access, 'q', { fetchImpl: impl })).toEqual({
      ok: false,
      reason: 'publik search could not be reached',
    })
  })

  it('reports an answer it cannot read', async () => {
    const { impl } = stubFetch(() => new Response('<html>', { status: 200 }))
    const out = await searchPublik(access, 'q', { fetchImpl: impl })
    expect(out.ok).toBe(false)
  })

  it('passes Stop on to the request', async () => {
    const stop = new AbortController()
    const { impl, calls } = stubFetch((call) => {
      stop.abort()
      expect(call.init.signal?.aborted).toBe(true)
      throw new DOMException('aborted', 'AbortError')
    })
    const out = await searchPublik(access, 'q', {
      fetchImpl: impl,
      signal: stop.signal,
    })
    expect(calls).toHaveLength(1)
    expect(out.ok).toBe(false)
  })

  it('never puts the key in a reason', async () => {
    for (const status of [401, 402, 503]) {
      const { impl } = stubFetch(() => json({}, status))
      const out = await searchPublik(access, 'q', { fetchImpl: impl })
      expect(JSON.stringify(out)).not.toContain(KEY)
    }
  })
})
