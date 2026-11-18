import { describe, expect, it } from 'bun:test'
import { chatToOpen } from '../../lib/simplicity/route-chat'
import { leaveDeletedChat } from './delete-chat'

describe('leaveDeletedChat (INV-ENGINE-33)', () => {
  it('clears the thread before the route goes home', () => {
    const calls: string[] = []
    leaveDeletedChat(
      () => calls.push('clear'),
      (h) => calls.push(h),
    )
    expect(calls).toEqual(['clear', '#/home'])
  })

  it('the route change alone keeps the old thread (why the clear is needed)', () => {
    expect(chatToOpen('abc', undefined, 'abc')).toBeNull()
  })
})
