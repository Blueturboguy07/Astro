import { describe, expect, it } from 'bun:test'
import {
  nextUtcMidnight,
  PUBLIK_PLANS_URL,
  PUBLIK_WALLET_URL,
  parsePublikErrorCard,
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

  it('reads the per-account daily limit text (0.0.109 UI run)', () => {
    const now = new Date('2026-11-17T11:45:00Z')
    const out = parsePublikLimitError(
      '429 This account has reached its daily limit. It applies to all of its keys together and resets at midnight UTC.',
      now,
    )
    expect(out?.title).toBe('Daily limit reached')
    expect(out?.text).toContain('account (all of its keys together)')
    expect(out?.text).toContain('in 12 h 15 min')
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

describe('parsePublikErrorCard (council seats, answer engine 402)', () => {
  it('turns the raw 429 of a council seat into the limit card', () => {
    const card = parsePublikErrorCard(
      '429 This account has reached its daily limit. It applies to all of its keys together and resets at midnight UTC.',
      NOW,
    )
    expect(card?.title).toBe('Daily limit reached')
    expect(card?.text).toContain('all of its keys together')
    expect(card?.text).not.toContain('429')
    expect(card?.url).toBe(PUBLIK_WALLET_URL)
    expect(card?.linkLabel).toBe('Open wallet')
  })

  it('turns the answer engine 402 text into the balance card', () => {
    const card = parsePublikErrorCard(
      '402 Your publik balance is too low for this request.',
    )
    expect(card).toEqual({
      title: 'Not enough publik balance',
      text: 'Your publik balance is too low for this request.',
      url: PUBLIK_PLANS_URL,
      linkLabel: 'Get a plan',
    })
  })

  it('reads the 402 JSON body and keeps only a publikhq.com link', () => {
    const body = (top_up_url: string) =>
      JSON.stringify({
        error: { type: 'insufficient_credit', message: 'Too low.', top_up_url },
      })
    expect(
      parsePublikErrorCard(body('https://publikhq.com/wallet/add?x=1'))?.url,
    ).toBe('https://publikhq.com/wallet/add?x=1')
    expect(parsePublikErrorCard(body('https://evil.example/pay'))?.url).toBe(
      PUBLIK_PLANS_URL,
    )
  })

  it('leaves other errors alone', () => {
    expect(parsePublikErrorCard('500 Internal error')).toBeNull()
    expect(parsePublikErrorCard('This model failed to answer.')).toBeNull()
  })
})
