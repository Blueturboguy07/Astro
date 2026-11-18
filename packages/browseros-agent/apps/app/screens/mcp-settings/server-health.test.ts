import { describe, expect, it, mock } from 'bun:test'

mock.module('@/lib/messaging/server/serverMessages', () => ({
  sendServerMessage: async () => ({ healthy: true }),
}))

const { waitForServerHealth } = await import('./server-health')

describe('waitForServerHealth (INV-SET-36)', () => {
  it('ends with false at the time-out even when a probe never answers', async () => {
    const started = Date.now()
    const ok = await waitForServerHealth(() => new Promise(() => {}), 120, 20)
    expect(ok).toBe(false)
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('a thrown probe counts as not healthy; a later healthy probe wins', async () => {
    let n = 0
    const ok = await waitForServerHealth(
      async () => {
        n++
        if (n === 1) throw new Error('down')
        return n >= 3
      },
      2000,
      10,
    )
    expect(ok).toBe(true)
    expect(n).toBe(3)
  })
})
