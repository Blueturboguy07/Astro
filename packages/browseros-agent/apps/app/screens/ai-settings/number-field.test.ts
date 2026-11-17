import { describe, expect, it } from 'bun:test'
import { numberFieldValue } from './number-field'
import { providerFormSchema } from './provider-form-schema'

const field = (value: string) => ({
  value,
  valueAsNumber: value.trim() === '' ? Number.NaN : Number(value),
})

describe('provider number fields (F-087)', () => {
  it('an emptied field stays empty, not 0', () => {
    expect(numberFieldValue(field(''))).toBe('')
    expect(numberFieldValue({ value: '-', valueAsNumber: Number.NaN })).toBe('')
  })

  it('a typed number is kept, also when it is out of range', () => {
    expect(numberFieldValue(field('-1'))).toBe(-1)
    expect(numberFieldValue(field('1.5'))).toBe(1.5)
  })

  it('the form refuses an empty or negative value with a message', () => {
    const base = {
      type: 'openai',
      name: 'Mine',
      modelId: 'gpt-x',
      supportsImages: false,
      contextWindow: 128000,
      temperature: 0.2,
    }
    const messages = (patch: Record<string, unknown>) => {
      const r = providerFormSchema.safeParse({ ...base, ...patch })
      return r.success ? [] : r.error.issues.map((i) => i.message)
    }
    expect(messages({ temperature: '' })).toContain('Enter a number')
    expect(messages({ temperature: -1 })).toContain('Use 0 or more')
    expect(messages({ contextWindow: '' })).toContain('Enter a number')
    expect(messages({ contextWindow: 0 })).toContain(
      'Use at least 1,000 tokens',
    )
  })
})
