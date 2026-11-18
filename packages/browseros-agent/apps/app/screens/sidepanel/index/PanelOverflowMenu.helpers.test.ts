import { describe, expect, it } from 'bun:test'
import {
  PANEL_CHAT_PATH,
  startNewConversation,
} from './PanelOverflowMenu.helpers'

describe('startNewConversation (F-090)', () => {
  it('resets the conversation and goes back to the chat view', () => {
    const calls: string[] = []
    startNewConversation(
      () => calls.push('reset'),
      (path) => calls.push(`navigate ${path}`),
    )
    expect(calls).toEqual(['reset', `navigate ${PANEL_CHAT_PATH}`])
    expect(PANEL_CHAT_PATH).toBe('/')
  })
})
