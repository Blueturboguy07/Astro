import { describe, expect, it } from 'bun:test'
import {
  nextUtcMidnight,
  PUBLIK_WALLET_URL,
  parsePublikLimitError,
} from './limit-error'

const NOW = new Date('2026-11-17T18:48:00Z')

describe('parsePublikLimitError (F-050)', () => {
  it('reads the gateway body the local server passes on', () => {
    const e = parsePublikLimitError(
      JSON.stringify({
        error: {
          type: 'daily_cap_reached',
          message: 'This key has reached its daily spending cap.',
          reset_at: '2026-11-18T00:00:00.000Z',
        },
      }),
      NOW,
    )
    expect(e?.title).toBe('Daily limit reached')
    expect(e?.text).toContain('in 5 h 12 min')
    expect(e?.url).toBe(PUBLIK_WALLET_URL)
  })

  it('reads the plain text of the answer engine', () => {
    const e = parsePublikLimitError(
      '429 This key has reached its daily limit. It resets at midnight UTC.',
      NOW,
    )
    expect(e?.title).toBe('Daily limit reached')
    expect(e?.text).toContain('at midnight UTC, in 5 h 12 min')
  })

  it('handles the spent plan budget', () => {
    const e = parsePublikLimitError(
      JSON.stringify({
        error: {
          type: 'week_budget_reached',
          message: "This month's plan budget is spent.",
        },
      }),
      NOW,
    )
    expect(e?.title).toBe('Plan budget used up')
    expect(e?.url).toBe(PUBLIK_WALLET_URL)
  })

  it('ignores other errors', () => {
    expect(parsePublikLimitError('Astro LLM daily limit reached', NOW)).toBe(
      null,
    )
    expect(parsePublikLimitError('500 upstream failed', NOW)).toBe(null)
  })

  it('finds the next UTC midnight', () => {
    expect(nextUtcMidnight(NOW).toISOString()).toBe('2026-11-18T00:00:00.000Z')
  })
})
