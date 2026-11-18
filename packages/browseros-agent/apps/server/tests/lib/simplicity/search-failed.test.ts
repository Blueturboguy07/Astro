/**
 * Astro 0.2.4 QA, F-088: with every local search engine suspended, the
 * answer said "could not find any relevant information". Now the turn shows
 * which engines failed and why, with no writer call; a publik turn first
 * tries the publik search line and puts its charge on the cost line.
 * fetch is stubbed: nothing leaves this process.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import SearchAgent from '../../../src/lib/simplicity/agents/search'
import Researcher from '../../../src/lib/simplicity/agents/search/researcher'
import type { SearchAgentConfig } from '../../../src/lib/simplicity/agents/search/types'
import configManager from '../../../src/lib/simplicity/config'
import { UsageMeter } from '../../../src/lib/simplicity/pricing/meter'
import { searchSearxng } from '../../../src/lib/simplicity/searxng'
import SessionManager from '../../../src/lib/simplicity/session'

const SEARX = 'http://searx.test'
const KEY = 'pk_test_not_a_real_key'
const PUBLIK = { baseURL: 'https://publik.test/api/v1', apiKey: KEY }
const QUESTION = 'longest rivers in australia'

const SUSPENDED = {
  results: [],
  suggestions: [],
  unresponsive_engines: [
    ['duckduckgo', 'CAPTCHA'],
    ['brave', 'too many requests'],
  ],
}

const PUBLIK_OK = {
  object: 'search.results',
  query: QUESTION,
  count: 1,
  more: false,
  results: [
    {
      url: 'https://en.wikipedia.org/wiki/Murray_River',
      title: 'Murray River',
      snippet: 'The Murray is the longest river in Australia.',
      site: 'en.wikipedia.org',
      age: null,
    },
  ],
  charge_micros: 10000,
  request_id: 'req_test',
}

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

type SeenBlock = {
  type: string
  data: { engines?: unknown; breakdown?: unknown }
}
type SessionData = { type?: string; block: SeenBlock }

let realFetch: typeof fetch
let publikCalls: RequestInit[]
let searxBody: unknown
let publikReply: () => Response

beforeEach(() => {
  realFetch = globalThis.fetch
  publikCalls = []
  searxBody = SUSPENDED
  publikReply = () =>
    json(PUBLIK_OK, 200, { 'x-publik-charge-micros': '10000' })
  configManager.updateConfig('search.searxngURL', SEARX)
  globalThis.fetch = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    const u = String(url)
    if (u.startsWith(`${SEARX}/search`)) return json(searxBody)
    if (u === `${PUBLIK.baseURL}/search`) {
      publikCalls.push(init ?? {})
      return publikReply()
    }
    throw new Error(`unexpected fetch in test: ${u}`)
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  configManager.updateConfig('search.searxngURL', '')
})

/* Every model call fails: the classifier and the query planner fall back
   to plain web search with the question as typed. */
const fakeLLM = (onWrite?: () => void) =>
  ({
    generateObject: async () => {
      throw new Error('no model in this test')
    },
    generateText: async () => {
      throw new Error('no model in this test')
    },
    streamText: async function* () {
      onWrite?.()
      yield { contentChunk: 'An answer.' }
    },
    setMeter: () => {},
  }) as unknown as SearchAgentConfig['llm']

const zeroEmbedding = {
  embedText: async (t: string[]) => t.map(() => [0]),
} as unknown as SearchAgentConfig['embedding']

const config = (over: Partial<SearchAgentConfig> = {}): SearchAgentConfig => ({
  sources: ['web'],
  fileIds: [],
  llm: fakeLLM(),
  embedding: zeroEmbedding,
  mode: 'speed',
  systemInstructions: 'None',
  incognito: true,
  ...over,
})

const research = (cfg: SearchAgentConfig) =>
  new Researcher().research(SessionManager.createSession(), {
    chatHistory: [],
    followUp: QUESTION,
    classification: {
      classification: {
        skipSearch: false,
        personalSearch: false,
        academicSearch: false,
        discussionSearch: false,
        showWeatherWidget: false,
        showStockWidget: false,
        showCalculationWidget: false,
      },
      standaloneFollowUp: QUESTION,
    },
    config: cfg,
  })

describe('searchSearxng', () => {
  it('returns the engines that did not answer', async () => {
    const res = await searchSearxng(QUESTION)
    expect(res.results).toEqual([])
    expect(res.unresponsive).toEqual([
      { engine: 'duckduckgo', reason: 'CAPTCHA' },
      { engine: 'brave', reason: 'too many requests' },
    ])
  })
})

describe('Researcher with every engine suspended', () => {
  it('reports the failed engines when the model is not publik', async () => {
    const out = await research(config())
    expect(out.searchFindings).toEqual([])
    expect(out.searchFailed).toEqual({
      engines: [
        { engine: 'duckduckgo', reason: 'CAPTCHA' },
        { engine: 'brave', reason: 'too many requests' },
      ],
      errors: [],
    })
    expect(publikCalls).toHaveLength(0)
  })

  it('searches once with publik and puts the charge on the cost line', async () => {
    const usageMeter = new UsageMeter()
    const out = await research(config({ publikSearch: PUBLIK, usageMeter }))

    expect(publikCalls).toHaveLength(1)
    expect(out.searchFailed).toBeUndefined()
    expect(out.searchFindings.map((c) => c.metadata.url)).toEqual([
      'https://en.wikipedia.org/wiki/Murray_River',
    ])

    const summary = usageMeter.summarize()
    expect(summary.breakdown).toEqual([
      {
        label: 'web search',
        model: 'publik-search',
        providerId: 'publik-search',
        providerType: 'openai',
        inputTokens: 0,
        outputTokens: 0,
        cost: 0.01,
        free: false,
        kind: 'search',
        count: 1,
      },
    ])
    expect(summary.totalCost).toBeCloseTo(0.01)
    expect(summary.priced).toBe(true)
  })

  it('shows the failure with the publik reason when publik also fails', async () => {
    publikReply = () => json({ error: { message: 'Not enough credit.' } }, 402)
    const usageMeter = new UsageMeter()
    const out = await research(config({ publikSearch: PUBLIK, usageMeter }))

    expect(publikCalls).toHaveLength(1)
    expect(out.searchFailed?.engines).toHaveLength(2)
    expect(out.searchFailed?.fallback).toBe(
      'publik web search also failed: not enough publik balance (HTTP 402). Nothing was charged.',
    )
    expect(usageMeter.summarize().breakdown).toEqual([])
  })

  it('does not pay for publik when SearXNG found something', async () => {
    searxBody = {
      results: [
        {
          title: 'Longest rivers in Australia',
          url: 'https://example.org/rivers-australia',
          content:
            'The longest rivers in Australia are the Murray and Darling.',
        },
      ],
      unresponsive_engines: [['duckduckgo', 'CAPTCHA']],
    }
    const out = await research(config({ publikSearch: PUBLIK }))
    expect(publikCalls).toHaveLength(0)
    expect(out.searchFailed).toBeUndefined()
    expect(out.searchFindings).toHaveLength(1)
  })

  it('names the SearXNG error when the search itself fails', async () => {
    searxBody = undefined
    globalThis.fetch = (async () =>
      new Response('busy', {
        status: 500,
        statusText: 'Internal Server Error',
      })) as unknown as typeof fetch
    const out = await research(config())
    expect(out.searchFailed?.errors).toEqual([
      'SearXNG error: Internal Server Error',
    ])
  })
})

describe('SearchAgent with every engine suspended', () => {
  it('ends the turn with the failure and never calls the writer', async () => {
    let writerCalls = 0
    const session = SessionManager.createSession()
    const blocks: SeenBlock[] = []
    let ended = false
    session.subscribe((event: string, data: SessionData) => {
      if (event === 'data' && data.type === 'block') blocks.push(data.block)
      if (event === 'end') ended = true
    })

    await new SearchAgent().searchAsync(session, {
      chatHistory: [],
      followUp: QUESTION,
      chatId: 'chat-f088',
      messageId: 'msg-f088',
      config: config({
        llm: fakeLLM(() => {
          writerCalls++
        }),
        usageMeter: new UsageMeter(),
      }),
    })

    expect(writerCalls).toBe(0)
    expect(ended).toBe(true)
    expect(blocks.some((b) => b.type === 'text')).toBe(false)
    const failed = blocks.find((b) => b.type === 'searchFailed')
    expect(failed?.data.engines).toEqual([
      { engine: 'duckduckgo', reason: 'CAPTCHA' },
      { engine: 'brave', reason: 'too many requests' },
    ])
  })

  it('writes the answer from the publik results', async () => {
    let writerCalls = 0
    const session = SessionManager.createSession()
    const blocks: SeenBlock[] = []
    session.subscribe((event: string, data: SessionData) => {
      if (event === 'data' && data.type === 'block') blocks.push(data.block)
    })

    await new SearchAgent().searchAsync(session, {
      chatHistory: [],
      followUp: QUESTION,
      chatId: 'chat-f088',
      messageId: 'msg-f088-2',
      config: config({
        llm: fakeLLM(() => {
          writerCalls++
        }),
        publikSearch: PUBLIK,
        usageMeter: new UsageMeter(),
      }),
    })

    expect(writerCalls).toBe(1)
    expect(blocks.some((b) => b.type === 'searchFailed')).toBe(false)
    const usage = blocks.find((b) => b.type === 'usage')
    expect(usage?.data.breakdown).toContainEqual(
      expect.objectContaining({ label: 'web search', cost: 0.01, count: 1 }),
    )
  })
})
