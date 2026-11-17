import { describe, expect, it } from 'bun:test'
import SessionManager from '../../../src/lib/simplicity/session'
import {
  messageEndEvent,
  turnEndStatus,
} from '../../../src/lib/simplicity/turn-end'

/* Astro 0.2.4 QA, F-059: a page that reconnects to a turn cancelled by a
   reload must learn that it was cancelled, not completed. */
describe('turn end status', () => {
  it('marks an aborted turn as cancelled', () => {
    expect(turnEndStatus(true)).toEqual({ status: 'cancelled' })
    expect(turnEndStatus(false)).toEqual({ status: 'completed' })
    expect(turnEndStatus(undefined)).toEqual({ status: 'completed' })
  })

  it('puts the status on messageEnd, completed by default', () => {
    expect(messageEndEvent({ status: 'cancelled' })).toEqual({
      type: 'messageEnd',
      status: 'cancelled',
    })
    expect(messageEndEvent({})).toEqual({
      type: 'messageEnd',
      status: 'completed',
    })
    expect(messageEndEvent(undefined).status).toBe('completed')
  })

  it('replays the cancelled end to a late subscriber (a reconnect)', () => {
    const session = SessionManager.createSession()
    session.emit('end', turnEndStatus(true))
    const seen: unknown[] = []
    session.subscribe((event, data) => {
      if (event === 'end') seen.push(messageEndEvent(data))
    })
    expect(seen).toEqual([{ type: 'messageEnd', status: 'cancelled' }])
  })
})
