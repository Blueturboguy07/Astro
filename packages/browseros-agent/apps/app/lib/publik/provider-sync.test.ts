import { describe, expect, it } from 'bun:test'
import {
  planServerEntry,
  retryWithBackoff,
  SYNC_RETRY_DELAYS_MS,
  showConnectButton,
} from './provider-sync'

/* Astro 0.2.4 QA, F-078: on 1 of 3 fresh Windows starts the answer engine
   stayed without its publik connection ("No AI connection yet"): the one
   write at "Connect your plan" failed and nothing tried again. */
describe('retryWithBackoff', () => {
  it('tries again after a failure, with the given waits, until it works', async () => {
    const waits: number[] = []
    let n = 0
    const ok = await retryWithBackoff(
      async () => ++n === 3,
      SYNC_RETRY_DELAYS_MS,
      async () => true,
      async (ms) => void waits.push(ms),
    )
    expect(ok).toBe(true)
    expect(n).toBe(3)
    expect(waits).toEqual(SYNC_RETRY_DELAYS_MS.slice(0, 2))
  })

  it('gives up after the last wait (the alarm takes over)', async () => {
    let n = 0
    const ok = await retryWithBackoff(
      async () => {
        n++
        return false
      },
      [1, 2, 3],
      async () => true,
      async () => {},
    )
    expect(ok).toBe(false)
    expect(n).toBe(4)
  })

  it('stops when the person picks another choice', async () => {
    let n = 0
    let choice = 'publik'
    const ok = await retryWithBackoff(
      async () => {
        n++
        choice = 'own_key'
        return false
      },
      [1, 2, 3],
      async () => choice === 'publik',
      async () => {},
    )
    expect(ok).toBe(false)
    expect(n).toBe(1)
  })
})

describe('planServerEntry', () => {
  const publik = {
    id: 'p1',
    name: 'publik API',
    config: { baseURL: 'https://publikhq.com/api/v1' },
  }

  it('uses the listed entry', () => {
    expect(planServerEntry([publik], 'p1')).toEqual({ use: publik })
  })

  it('writes a new entry when the stored id is not listed (was counted as done)', () => {
    expect(planServerEntry([{ id: 'other', name: 'Mine' }], 'gone')).toEqual({
      create: true,
      staleId: 'gone',
    })
    expect(planServerEntry([], null)).toEqual({ create: true, staleId: null })
  })
})

describe('showConnectButton', () => {
  it('shows "Connect your plan" when the plan is chosen but not connected', () => {
    expect(showConnectButton('publik', false)).toBe(true)
    expect(showConnectButton('publik', true)).toBe(false)
    expect(showConnectButton('publik', null)).toBe(false)
    expect(showConnectButton('own_key', true)).toBe(true)
    expect(showConnectButton(null, null)).toBe(true)
  })
})
