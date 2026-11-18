/**
 * Astro 0.2.4 QA, F-088: a publik web search is on the cost line as
 * "web search $0.01", not as a model with no tokens.
 */
import { describe, expect, it } from 'bun:test'
import { usageParts } from './usage-parts'

const model = {
  label: 'publik Balanced',
  model: 'publik-balanced',
  providerId: 'p1',
  providerType: 'openai',
  inputTokens: 1200,
  outputTokens: 300,
  cost: null,
  free: false,
}

const search = {
  label: 'web search',
  model: 'publik-search',
  providerId: 'publik-search',
  providerType: 'openai',
  inputTokens: 0,
  outputTokens: 0,
  cost: 0.01,
  free: false,
  kind: 'search' as const,
  count: 1,
}

describe('usageParts', () => {
  it('counts models and searches apart', () => {
    expect(
      usageParts({
        totalCost: 0.01,
        breakdown: [model, search],
        free: false,
        priced: false,
      }),
    ).toEqual({ tokens: 1500, modelCount: 1, searchCount: 1, searchCost: 0.01 })
  })

  it('is unchanged for a turn without a search', () => {
    expect(
      usageParts({
        totalCost: 0,
        breakdown: [model, { ...model, providerId: 'p2' }],
        free: false,
      }),
    ).toEqual({ tokens: 3000, modelCount: 2, searchCount: 0, searchCost: 0 })
  })
})
