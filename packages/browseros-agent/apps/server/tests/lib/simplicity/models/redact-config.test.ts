import { describe, expect, it } from 'bun:test'
import { redactConfig } from '../../../../src/lib/simplicity/models/redact-config'

describe('redactConfig', () => {
  it('never keeps a key, token or secret', () => {
    const line = JSON.stringify(
      redactConfig({
        baseURL: 'https://publikhq.com/api/v1',
        apiKey: 'pk_live_example',
        accessToken: 't',
        clientSecret: 's',
        headers: { Authorization: 'Bearer x' },
      }),
    )
    expect(line).not.toContain('pk_live_example')
    expect(line).not.toContain('Bearer x')
    expect(line).toContain('https://publikhq.com/api/v1')
    expect(line).toContain('[redacted]')
  })

  it('handles a missing config', () => {
    expect(redactConfig(undefined)).toEqual({})
  })
})
