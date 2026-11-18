import { describe, expect, it } from 'bun:test'
import { formatCompact, formatMoneyCompact } from './stock-format'

describe('stock card numbers (F-076)', () => {
  it('volume is a share count with no currency sign', () => {
    expect(formatCompact(45_010_000)).toBe('45.01M')
    expect(formatCompact(undefined)).toBe('N/A')
  })

  it('market cap uses the quote currency', () => {
    expect(formatMoneyCompact(5.13e12, 'USD', 'en-US')).toBe('$5.13T')
    expect(formatMoneyCompact(2.1e9, 'EUR', 'en-US')).toBe('€2.10B')
    expect(formatMoneyCompact(2.1e9, undefined)).toBe('2.10B')
  })
})
