import { describe, expect, it } from 'bun:test'
import type { PublikAccount } from '@/lib/publik/publik'
import { accountFooter } from './comet-sidebar.helpers'

/* F-005 (Astro 0.2.4 QA): the left rail always said "ME / Local / BYO key",
   also for a person signed in with publik. */

const account = (over: Partial<PublikAccount> = {}): PublikAccount => ({
  handle: 'mann',
  plan: { kind: 'pack', label: null },
  balance_micros: 59_641_700,
  top_up_url: null,
  linked_at: null,
  seen_at: 0,
  ...over,
})

describe('accountFooter', () => {
  it('shows the publik handle and the balance', () => {
    expect(accountFooter(account(), 'publik')).toEqual({
      initials: 'MA',
      title: '@mann',
      detail: 'Balance $59.64',
    })
  })

  it('shows the plan name for a plan', () => {
    expect(
      accountFooter(
        account({ plan: { kind: 'plan', label: 'publik Pro' } }),
        'publik',
      )?.detail,
    ).toBe('publik Pro')
  })

  it('says own keys for the person who chose them', () => {
    expect(accountFooter(account(), 'own_key')?.detail).toBe('Your own keys')
  })

  it('shows nothing without an account (never "Local / BYO key")', () => {
    expect(accountFooter(null, null)).toBeNull()
    expect(accountFooter(undefined, undefined)).toBeNull()
  })

  it('works without a handle', () => {
    expect(accountFooter(account({ handle: null }), 'publik')?.title).toBe(
      'publik',
    )
  })
})
