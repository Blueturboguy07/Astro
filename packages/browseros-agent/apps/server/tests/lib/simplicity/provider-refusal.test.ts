import { describe, expect, it } from 'bun:test'
import { providerRefusal } from '../../../src/lib/simplicity/agents/search/provider-refusal'

describe('providerRefusal (INV-DOCS-23)', () => {
  it('the high-risk rejection text is an error, not an answer', () => {
    expect(
      providerRefusal(
        'The request was rejected because it was considered high risk',
      ),
    ).toBe(
      'The model\'s provider refused this request. It said: "The request was rejected because it was considered high risk" Try again, rephrase the question, or choose another model.',
    )
  })

  it('finish_reason content_filter is an error even with no text', () => {
    expect(providerRefusal('', 'content_filter')).toContain(
      "The model's provider refused this request.",
    )
  })

  it('a real answer passes, also one that quotes such words at length', () => {
    expect(
      providerRefusal('Canberra is the capital of Australia.', 'stop'),
    ).toBeNull()
    expect(
      providerRefusal(
        `${'Content moderation explained. '.repeat(12)}A request was rejected because it was considered high risk in that study.`,
      ),
    ).toBeNull()
    expect(providerRefusal('')).toBeNull()
  })
})
