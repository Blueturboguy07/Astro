import { describe, expect, it } from 'bun:test'
import { councilExample } from '../../../src/tools/search/model-council'

/* Astro 0.2.4 QA, F-048: the example made the agent ask publik for gpt-5.4. */
describe('councilExample', () => {
  it('names publik tiers for a publik connection', () => {
    expect(
      councilExample({
        model: 'publik-balanced',
        baseUrl: 'https://publikhq.com/api/v1',
      }),
    ).toBe('["publik-fast","publik-smart"]')
  })

  it('never names a vendor model the provider may not serve', () => {
    expect(councilExample({ model: 'llama3', baseUrl: undefined })).not.toMatch(
      /gpt-5/,
    )
  })
})
