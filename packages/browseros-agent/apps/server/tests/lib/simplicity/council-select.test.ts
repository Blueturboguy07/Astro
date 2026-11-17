import { describe, expect, it } from 'bun:test'
import {
  autoPickCouncil,
  canRunCouncil,
} from '../../../src/lib/simplicity/agents/council/select'

const model = (key: string) => ({ name: key, key })
const publik = {
  id: 'publik',
  type: 'openai',
  name: 'publik API',
  chatModels: ['publik-balanced', 'publik-fast', 'publik-smart'].map(model),
  embeddingModels: [],
}

/* Astro 0.2.4 QA, F-055: a publik-only person could never run a council. */
describe('council seats', () => {
  it('counts each publik tier as its own seat', () => {
    expect(canRunCouncil([publik])).toBe(true)
    expect(
      autoPickCouncil([publik])
        .map((r) => r.key)
        .sort(),
    ).toEqual(['publik-balanced', 'publik-fast', 'publik-smart'])
  })

  it('still counts two rows of one real vendor as one seat', () => {
    const openai = {
      id: 'openai',
      type: 'openai',
      name: 'OpenAI',
      chatModels: ['gpt-5.1', 'gpt-5-mini'].map(model),
      embeddingModels: [],
    }
    expect(canRunCouncil([openai])).toBe(false)
  })
})

describe('council cost estimate', () => {
  it('never calls publik tiers free, and gives no number without prices', async () => {
    const { estimateCouncilCost } = await import(
      '../../../src/lib/simplicity/agents/council/select'
    )
    const est = estimateCouncilCost(
      'question',
      [
        { rowId: 'publik-fast', providerType: 'openai', key: 'publik-fast' },
        { rowId: 'publik-smart', providerType: 'openai', key: 'publik-smart' },
      ],
      { providerType: 'openai', key: 'publik-balanced' },
    )
    expect(est.free).toBe(false)
    expect(est.totalUSD).toBe(null)
  })
})
