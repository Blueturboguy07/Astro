import { describe, expect, it } from 'bun:test'
import { BALANCE_READ_DELAYS_MS, readBalanceAfterAnswer } from './balance-reads'

describe('readBalanceAfterAnswer (F-089: rail balance read once)', () => {
  it('reads now and again after the 10 s throttle', () => {
    const scheduled: number[] = []
    readBalanceAfterAnswer(
      () => {},
      (_fn, ms) => scheduled.push(ms),
    )
    expect(scheduled).toEqual([...BALANCE_READ_DELAYS_MS])
    expect(scheduled[1]).toBeGreaterThan(10_000)
  })

  it('cancels both reads', () => {
    const cancelled: unknown[] = []
    const stop = readBalanceAfterAnswer(
      () => {},
      (_fn, ms) => `t${ms}`,
      (id) => cancelled.push(id),
    )
    stop()
    expect(cancelled).toEqual(['t0', 't15000'])
  })
})
