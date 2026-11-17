import { describe, expect, it } from 'bun:test'
import { readConfigResponse } from './settings-config'

/* Astro 0.2.4 QA, F-030. */
describe('readConfigResponse', () => {
  it('returns a config with fields and values', () => {
    const c = readConfigResponse(true, 200, { fields: {}, values: {} })
    expect(c).toEqual({ fields: {}, values: {} })
  })

  it('throws the server message on a failed load', () => {
    expect(() =>
      readConfigResponse(false, 500, { message: 'An error has occurred.' }),
    ).toThrow('An error has occurred.')
  })

  it('throws on a body without fields', () => {
    expect(() => readConfigResponse(true, 200, null)).toThrow('HTTP 200')
  })
})
