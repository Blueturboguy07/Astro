import { describe, expect, it } from 'bun:test'
import { endRunOnServer } from './end-run'

describe('endRunOnServer (F-089: a cancelled run left its tab)', () => {
  it('ends the server session of the run', async () => {
    const calls: [string, RequestInit | undefined][] = []
    await endRunOnServer('http://127.0.0.1:9100', 'run-1', (async (
      url: string,
      init?: RequestInit,
    ) => {
      calls.push([url, init])
      return new Response('{}')
    }) as unknown as typeof fetch)
    expect(calls).toEqual([
      ['http://127.0.0.1:9100/chat/run-1', { method: 'DELETE' }],
    ])
  })

  it('never throws when the server is gone', async () => {
    await expect(
      endRunOnServer('http://127.0.0.1:1', 'x', (async () => {
        throw new TypeError('fetch failed')
      }) as unknown as typeof fetch),
    ).resolves.toBeUndefined()
  })
})
