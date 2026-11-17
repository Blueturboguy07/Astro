import { describe, expect, it } from 'bun:test'
import { newChatNotice, switchStartsNewChat } from './provider-switch'

describe('switchStartsNewChat (F-041)', () => {
  const a = { kind: 'llm', id: 'a' }
  it('is true only for another target in a chat with messages', () => {
    expect(switchStartsNewChat(a, { kind: 'llm', id: 'b' }, 2)).toBe(true)
    expect(switchStartsNewChat(a, { kind: 'acp', id: 'a' }, 2)).toBe(true)
    expect(switchStartsNewChat(a, a, 2)).toBe(false)
    expect(switchStartsNewChat(a, { kind: 'llm', id: 'b' }, 0)).toBe(false)
    expect(switchStartsNewChat(null, a, 2)).toBe(false)
  })

  it('names the new model and where the old chat went', () => {
    expect(newChatNotice('publik Smart')).toBe(
      'New chat with publik Smart. Your earlier chat is in History.',
    )
  })
})
