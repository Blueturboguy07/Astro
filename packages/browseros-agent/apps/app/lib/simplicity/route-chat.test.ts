import { describe, expect, it } from 'bun:test'
import { chatToOpen } from './route-chat'

describe('chatToOpen', () => {
  it('keeps the new chat while the old id is still in the route (F-056)', () => {
    /* On #/home/c/old, "New" set chatId to "new" before the route cleared. */
    expect(chatToOpen('old', 'old', 'new')).toBeNull()
    /* Then the route clears. */
    expect(chatToOpen('old', undefined, 'new')).toBeNull()
  })

  it('opens a chat the route now points to', () => {
    expect(chatToOpen(undefined, 'x', 'new')).toBe('x')
    expect(chatToOpen('a', 'b', 'a')).toBe('b')
  })

  it('does nothing when the route already shows the current chat', () => {
    expect(chatToOpen(undefined, 'x', 'x')).toBeNull()
    expect(chatToOpen('x', 'x', 'x')).toBeNull()
  })
})
