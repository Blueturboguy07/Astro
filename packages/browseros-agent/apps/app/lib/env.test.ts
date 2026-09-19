import { describe, expect, it } from 'bun:test'
import { parseAstroApiUrl } from './browseros-api-url'
import {
  parseAlphaFeaturesFlag,
  parsePublikBaseUrl,
  parsePublikToken,
} from './env'

describe('parseAlphaFeaturesFlag', () => {
  it('defaults alpha features off when unset', () => {
    expect(parseAlphaFeaturesFlag(undefined)).toBe(false)
  })

  it('keeps explicit true enabled', () => {
    expect(parseAlphaFeaturesFlag('true')).toBe(true)
  })

  it('keeps explicit false disabled', () => {
    expect(parseAlphaFeaturesFlag('false')).toBe(false)
  })
})

describe('parseAstroApiUrl', () => {
  it('defaults to the production Astro API when unset', () => {
    expect(parseAstroApiUrl(undefined)).toBe('https://api.browseros.com')
  })

  it('preserves explicit overrides', () => {
    expect(parseAstroApiUrl('http://127.0.0.1:3000')).toBe(
      'http://127.0.0.1:3000',
    )
  })

  it('rejects overrides without a scheme', () => {
    expect(() => parseAstroApiUrl('api.browseros.com')).toThrow(
      'VITE_PUBLIC_BROWSEROS_API must be a valid URL including http:// or https://',
    )
  })

  it('rejects non-HTTP overrides', () => {
    expect(() => parseAstroApiUrl('chrome-extension://extension-id')).toThrow(
      'VITE_PUBLIC_BROWSEROS_API must use http:// or https://',
    )
  })

  it('returns a URL that can form a valid WXT match pattern', () => {
    expect(`${parseAstroApiUrl(undefined)}/home`).toStartWith('https://')
  })
})

describe('parsePublikToken', () => {
  it('is absent when unset, blank or malformed', () => {
    expect(parsePublikToken(undefined)).toBeUndefined()
    expect(parsePublikToken('   ')).toBeUndefined()
    expect(parsePublikToken('sk-not-a-publik-token')).toBeUndefined()
  })

  it('keeps a well-formed app token', () => {
    const token = 'pat_astro_abcdefghijklmnopqrstuvwxyz012345'
    expect(parsePublikToken(` ${token} `)).toBe(token)
  })
})

describe('parsePublikBaseUrl', () => {
  it('defaults to the production gateway', () => {
    expect(parsePublikBaseUrl(undefined)).toBe('https://publikhq.com/api/v1')
    expect(parsePublikBaseUrl('')).toBe('https://publikhq.com/api/v1')
  })

  it('keeps an override without a trailing slash', () => {
    expect(parsePublikBaseUrl('http://127.0.0.1:3000/api/v1/')).toBe(
      'http://127.0.0.1:3000/api/v1',
    )
  })

  it('rejects non-HTTP overrides', () => {
    expect(() => parsePublikBaseUrl('chrome-extension://x')).toThrow(
      'VITE_PUBLIK_API_BASE_URL must use http:// or https://',
    )
  })
})
