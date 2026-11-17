import { describe, expect, it } from 'bun:test'
import { shouldGoToLogin } from './profile.helpers'

describe('shouldGoToLogin (F-032)', () => {
  it('sends a signed-out person to login once the session loaded', () => {
    expect(shouldGoToLogin(false, undefined)).toBe(true)
  })

  it('waits while the session loads and stays for a signed-in person', () => {
    expect(shouldGoToLogin(true, undefined)).toBe(false)
    expect(shouldGoToLogin(false, 'u1')).toBe(false)
  })
})
