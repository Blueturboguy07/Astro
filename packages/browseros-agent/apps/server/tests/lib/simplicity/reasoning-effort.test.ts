import { describe, expect, it } from 'bun:test'
import { reasoningEffortFor } from '../../../src/lib/simplicity/models/catalog'

/* F-062 (Astro 0.2.4 QA): the Thinking switch for publik Smart. */
describe('reasoningEffortFor', () => {
  it('sends medium for publik Smart with Thinking on, low with it off', () => {
    expect(reasoningEffortFor('publik-smart', true)).toBe('medium')
    expect(reasoningEffortFor('publik-smart', false)).toBe('low')
  })

  it('keeps GPT-5.1 as before: medium on, nothing off', () => {
    expect(reasoningEffortFor('gpt-5.1', true)).toBe('medium')
    expect(reasoningEffortFor('gpt-5.1', false)).toBeUndefined()
  })

  it('sends nothing for a model without the switch', () => {
    expect(reasoningEffortFor('publik-fast', true)).toBeUndefined()
    expect(reasoningEffortFor('qwen2.5:3b', true)).toBeUndefined()
  })
})
