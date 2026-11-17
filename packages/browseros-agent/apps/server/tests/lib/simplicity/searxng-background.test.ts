import { describe, expect, it } from 'bun:test'
import { makeSearxngURLWithoutWaiting } from '../../../src/lib/simplicity/searxng-background'

/* Astro 0.2.4 QA, F-025: every home/Discover load started the SearXNG setup
   and waited for it inside the request. */
describe('searxngURLWithoutWaiting', () => {
  it('starts the setup once in the background and never waits for it', async () => {
    let starts = 0
    const get = makeSearxngURLWithoutWaiting({
      configuredURL: () => '',
      runningURL: () => null,
      start: () => {
        starts += 1
        return Promise.reject(new Error('pip was killed'))
      },
    })
    expect(get()).toBeNull()
    expect(get()).toBeNull()
    expect(get()).toBeNull()
    await Promise.resolve()
    expect(starts).toBe(1)
  })

  it('returns the running or configured URL without starting anything', () => {
    let starts = 0
    const start = () => {
      starts += 1
      return Promise.resolve('x')
    }
    expect(
      makeSearxngURLWithoutWaiting({
        configuredURL: () => '',
        runningURL: () => 'http://127.0.0.1:1',
        start,
      })(),
    ).toBe('http://127.0.0.1:1')
    expect(
      makeSearxngURLWithoutWaiting({
        configuredURL: () => 'http://my-searx',
        runningURL: () => null,
        start,
      })(),
    ).toBe('http://my-searx')
    expect(starts).toBe(0)
  })
})
