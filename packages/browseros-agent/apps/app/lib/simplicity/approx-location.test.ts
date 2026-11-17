import { beforeEach, describe, expect, it, mock } from 'bun:test'

mock.module('@/lib/browseros/helpers', () => ({
  getAgentServerUrl: async () => 'http://127.0.0.1:1',
}))

const { getApproxLocation, resetApproxLocationForTesting } = await import(
  './actions'
)

/* Astro 0.2.4 QA, F-058. */
describe('getApproxLocation', () => {
  beforeEach(() => resetApproxLocationForTesting())

  it('asks once per page load', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      return new Response(
        JSON.stringify({ latitude: 1, longitude: 2, cityName: 'X' }),
      )
    }) as unknown as typeof fetch
    expect(await getApproxLocation(fetchImpl)).toEqual({
      latitude: 1,
      longitude: 2,
      city: 'X',
    })
    await getApproxLocation(fetchImpl)
    expect(calls).toBe(1)
  })

  it('gives null on a 429 HTML page instead of throwing', async () => {
    const fetchImpl = (async () =>
      new Response('<html>Too Many Requests</html>', {
        status: 429,
      })) as unknown as typeof fetch
    expect(await getApproxLocation(fetchImpl)).toBe(null)
  })
})
