import { describe, expect, it } from 'bun:test'

/* Astro 0.2.4 QA, F-011: importing the auth client must not create one (an
   app page sent api.browseros.com/api/auth/get-session). */
describe('auth client', () => {
  it('is created on first use, not at import', async () => {
    const fetched: string[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetched.push(String(input))
      return new Response('null', { status: 200 })
    }) as typeof fetch
    try {
      const mod = await import('./auth-client')
      await new Promise((r) => setTimeout(r, 20))
      expect(mod.authClientsCreated()).toBe(0)
      expect(fetched).toEqual([])
      const a = mod.getAuthClient()
      expect(mod.getAuthClient()).toBe(a)
      expect(mod.authClientsCreated()).toBe(1)
      expect(fetched).toEqual([])
    } finally {
      globalThis.fetch = realFetch
    }
  })
})
