import { describe, expect, it } from 'bun:test'
import {
  canSavePort,
  currentPortAfterSave,
  PROXY_PORT_MAX,
  PROXY_PORT_MIN,
  parseProxyPort,
  portFieldError,
} from './server-port-editor.helpers'

describe('portFieldError (F-087)', () => {
  it('says why a typed port cannot be saved', () => {
    expect(portFieldError('80', null)).toBe(
      `Port must be between ${PROXY_PORT_MIN} and ${PROXY_PORT_MAX}`,
    )
    expect(portFieldError('9o00', null)).toBe('Enter a valid port number')
  })

  it('shows nothing for an empty or valid field', () => {
    expect(portFieldError('', null)).toBeNull()
    expect(portFieldError('9005', null)).toBeNull()
  })

  it('a save error wins', () => {
    expect(portFieldError('9005', 'Failed to update port')).toBe(
      'Failed to update port',
    )
  })
})

describe('parseProxyPort', () => {
  it('accepts a valid in-range port', () => {
    expect(parseProxyPort('9004')).toEqual({ ok: true, port: 9004 })
  })

  it('accepts the inclusive boundaries', () => {
    expect(parseProxyPort(String(PROXY_PORT_MIN))).toEqual({
      ok: true,
      port: 9000,
    })
    expect(parseProxyPort(String(PROXY_PORT_MAX))).toEqual({
      ok: true,
      port: 9999,
    })
  })

  it('rejects ports outside the range with a message naming the bounds', () => {
    const low = parseProxyPort('8999')
    const high = parseProxyPort('10000')
    expect(low.ok).toBe(false)
    expect(high.ok).toBe(false)
    if (!low.ok) {
      expect(low.error).toContain('9000')
      expect(low.error).toContain('9999')
    }
    if (!high.ok) {
      expect(high.error).toContain('9000')
      expect(high.error).toContain('9999')
    }
  })

  it('rejects empty or whitespace-only input', () => {
    expect(parseProxyPort('').ok).toBe(false)
    expect(parseProxyPort('   ').ok).toBe(false)
  })

  it('rejects non-numeric input', () => {
    expect(parseProxyPort('90a4').ok).toBe(false)
    expect(parseProxyPort('abc').ok).toBe(false)
  })

  it('rejects non-integer input instead of truncating', () => {
    expect(parseProxyPort('9000.5').ok).toBe(false)
  })

  it('trims surrounding whitespace', () => {
    expect(parseProxyPort('  9100 ')).toEqual({ ok: true, port: 9100 })
  })
})

describe('port editor after a time-out (INV-SET-36)', () => {
  it('a time-out makes the saved port current, so the old one can be saved again', () => {
    const current = currentPortAfterSave('timeout', 9105, 9100)
    expect(current).toBe(9105)
    expect(canSavePort('9100', current, false)).toBe(true)
    expect(canSavePort('9105', current, false)).toBe(false)
  })

  it('a failed save keeps the old port', () => {
    expect(currentPortAfterSave('failed', 9105, 9100)).toBe(9100)
    expect(canSavePort('9105', 9100, false)).toBe(true)
  })

  it('no Save while saving or for a bad port', () => {
    expect(canSavePort('9105', 9100, true)).toBe(false)
    expect(canSavePort('80', 9100, false)).toBe(false)
  })
})
