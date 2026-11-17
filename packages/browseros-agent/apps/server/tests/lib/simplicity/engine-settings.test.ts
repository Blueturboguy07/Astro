import { describe, expect, it } from 'bun:test'
import { forecastURL } from '../../../src/api/routes/simplicity/weather/forecast-url'
import { resolveSearxngURL } from '../../../src/lib/searxng/search'

/* Astro 0.2.4 QA, F-030. */
describe('forecastURL', () => {
  it('asks for m/s in metric (the card says m/s)', () => {
    const u = new URL(forecastURL(48.1, 11.5, 'Metric'))
    expect(u.searchParams.get('wind_speed_unit')).toBe('ms')
    expect(u.searchParams.get('temperature_unit')).toBe(null)
  })

  it('asks for mph and fahrenheit in imperial', () => {
    const u = new URL(forecastURL(0, 0, 'Imperial'))
    expect(u.searchParams.get('wind_speed_unit')).toBe('mph')
    expect(u.searchParams.get('temperature_unit')).toBe('fahrenheit')
    expect(u.searchParams.get('latitude')).toBe('0')
  })
})

describe('resolveSearxngURL', () => {
  it('uses the URL from Settings first', async () => {
    let started = false
    const url = await resolveSearxngURL({
      configured: () => ' https://search.example.org/ ',
      running: () => 'http://127.0.0.1:1',
      startLocal: async () => {
        started = true
        return 'x'
      },
    })
    expect(url).toBe('https://search.example.org')
    expect(started).toBe(false)
  })

  it('falls back to the local instance when the setting is empty', async () => {
    expect(
      await resolveSearxngURL({
        configured: () => '',
        running: () => 'http://127.0.0.1:8888',
      }),
    ).toBe('http://127.0.0.1:8888')
    expect(
      await resolveSearxngURL({
        configured: () => '',
        running: () => null,
        startLocal: async () => 'http://127.0.0.1:9999',
      }),
    ).toBe('http://127.0.0.1:9999')
  })
})
