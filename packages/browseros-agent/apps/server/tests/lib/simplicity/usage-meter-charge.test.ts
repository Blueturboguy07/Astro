/**
 * Astro 0.2.4 QA, F-088: a publik web search costs $0.01 and has no
 * tokens; the turn's cost line counts it as "web search".
 */
import { describe, expect, it } from 'bun:test'
import { UsageMeter } from '../../../src/lib/simplicity/pricing/meter'

const search = {
  label: 'web search',
  model: 'publik-search',
  providerId: 'publik-search',
  providerType: 'openai',
  cost: 0.01,
}

describe('UsageMeter.recordCharge', () => {
  it('adds one search entry with its count and cost', () => {
    const m = new UsageMeter()
    m.recordCharge(search)
    m.recordCharge(search)
    const s = m.summarize()
    expect(s.breakdown).toEqual([
      {
        ...search,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0.02,
        free: false,
        kind: 'search',
        count: 2,
      },
    ])
    expect(s.totalCost).toBeCloseTo(0.02)
    expect(s.free).toBe(false)
    expect(s.priced).toBe(true)
  })

  it('keeps a publik model without price data unpriced', () => {
    const m = new UsageMeter()
    m.record({
      providerType: 'openai',
      providerId: 'p1',
      model: 'publik-balanced',
      inputTokens: 100,
      outputTokens: 20,
    })
    m.recordCharge(search)
    const s = m.summarize()
    expect(s.breakdown).toHaveLength(2)
    expect(s.breakdown[0].kind).toBeUndefined()
    expect(s.breakdown[1].kind).toBe('search')
    expect(s.priced).toBe(false)
    expect(s.totalCost).toBeCloseTo(0.01)
  })
})
