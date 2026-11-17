import { describe, expect, it } from 'bun:test'
import { UsageMeter } from '../../../src/lib/simplicity/pricing/meter'

/* Astro 0.2.4 QA, F-020: a paid publik answer was labeled "Free" because
   publik's models have no row in the price table. */

describe('UsageMeter.summarize', () => {
  it('marks an unpriced paid model as not free and not priced', () => {
    const meter = new UsageMeter()
    meter.record({
      providerType: 'openai',
      providerId: 'publik',
      model: 'publik-fast',
      inputTokens: 3030,
      outputTokens: 76,
    })
    const s = meter.summarize()
    expect(s.free).toBe(false)
    expect(s.priced).toBe(false)
    expect(s.breakdown[0].cost).toBeNull()
  })

  it('still calls local models free', () => {
    const meter = new UsageMeter()
    meter.record({
      providerType: 'ollama',
      providerId: 'local',
      model: 'llama3',
      inputTokens: 10,
      outputTokens: 5,
    })
    const s = meter.summarize()
    expect(s.free).toBe(true)
    expect(s.priced).toBe(true)
  })
})
