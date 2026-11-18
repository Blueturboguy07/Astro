import { describe, expect, it, mock } from 'bun:test'

mock.module(
  '@/lib/publik/limit-error',
  () => import('../../../lib/publik/limit-error'),
)
const { limitTextAt } = await import('./LiveLimitText')

describe('limitTextAt (F-089: static countdown)', () => {
  const message = JSON.stringify({
    error: {
      type: 'daily_cap_reached',
      reset_at: '2026-11-18T00:00:00Z',
    },
  })

  it('counts down as the clock moves', () => {
    const a = limitTextAt(message, new Date('2026-11-17T21:00:00Z'))
    const b = limitTextAt(message, new Date('2026-11-17T21:01:00Z'))
    expect(a).toContain('3 h 0 min')
    expect(b).toContain('2 h 59 min')
  })

  it('keeps other errors as they are', () => {
    expect(limitTextAt('boom', new Date())).toBe('boom')
  })
})
