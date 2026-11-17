import { describe, expect, it } from 'bun:test'
import { isProviderWrite } from './providers-changed'

describe('isProviderWrite (home refreshes after a connection change)', () => {
  it('is true for adding, changing and removing a connection', () => {
    expect(isProviderWrite('/api/providers', 'POST')).toBe(true)
    expect(isProviderWrite('/api/providers/abc', 'PATCH')).toBe(true)
    expect(isProviderWrite('/api/providers/abc', 'delete')).toBe(true)
    expect(isProviderWrite('/api/providers/abc/models', 'POST')).toBe(true)
  })

  it('is false for reads and for other routes', () => {
    expect(isProviderWrite('/api/providers')).toBe(false)
    expect(isProviderWrite('/api/providers', 'GET')).toBe(false)
    expect(isProviderWrite('/api/chat', 'POST')).toBe(false)
    expect(isProviderWrite('/api/providers-other', 'POST')).toBe(false)
  })
})
