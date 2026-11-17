/**
 * Astro 0.2.4 QA, F-059: answer turns that never ended (the model stream
 * stopped sending, the turn stayed "Brainstorming..." with Stop, and the
 * row stayed "answering" after a restart).
 */
import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
import {
  INTERRUPTED_ANSWER_TEXT,
  settleInterruptedAnswers,
} from '../../../src/lib/simplicity/db'
import {
  limitModel,
  ModelTimeoutError,
  withCallLimit,
  withIdleLimit,
} from '../../../src/lib/simplicity/models/time-limits'
import SessionManager from '../../../src/lib/simplicity/session'
import { turnWatchdog } from '../../../src/lib/simplicity/turn-watchdog'

async function* chunks(delays: number[]) {
  for (const [i, d] of delays.entries()) {
    await new Promise((r) => setTimeout(r, d))
    yield i
  }
}

async function* never(): AsyncGenerator<number> {
  await new Promise(() => {})
}

describe('withIdleLimit', () => {
  it('passes a stream that keeps sending', async () => {
    const got: number[] = []
    for await (const c of withIdleLimit(chunks([5, 5, 5]), { idleMs: 100 }))
      got.push(c)
    expect(got).toEqual([0, 1, 2])
  })

  it('throws when the stream stops sending', async () => {
    const got: number[] = []
    await expect(async () => {
      for await (const c of withIdleLimit(chunks([5, 500]), { idleMs: 50 }))
        got.push(c)
    }).toThrow(ModelTimeoutError)
    expect(got).toEqual([0])
  })

  it('gives the first chunk its own, longer limit', async () => {
    const got: number[] = []
    for await (const c of withIdleLimit(chunks([80, 5]), {
      idleMs: 30,
      firstMs: 200,
    }))
      got.push(c)
    expect(got).toEqual([0, 1])
  })

  it('ends quietly on Stop while the model sends nothing', async () => {
    const stop = new AbortController()
    setTimeout(() => stop.abort(), 20)
    const t0 = Date.now()
    const got: number[] = []
    for await (const c of withIdleLimit(never(), {
      idleMs: Number.POSITIVE_INFINITY,
      signal: stop.signal,
    }))
      got.push(c)
    expect(got).toEqual([])
    expect(Date.now() - t0).toBeLessThan(1000)
  })
})

describe('withCallLimit and limitModel', () => {
  it('rejects a call that takes too long', async () => {
    await expect(withCallLimit(new Promise(() => {}), 20)).rejects.toThrow(
      'The model did not answer in 0 seconds',
    )
  })

  it('puts the limits on every method of a loaded model', async () => {
    const llm = {
      streamText: () => never(),
      streamObject: () => never(),
      generateText: () => new Promise(() => {}),
      generateObject: () => new Promise(() => {}),
    }
    // biome-ignore lint/suspicious/noExplicitAny: a minimal fake model
    limitModel(llm as any, { idleMs: 20, firstMs: 20, callMs: 20 })
    await expect(llm.generateObject()).rejects.toThrow(ModelTimeoutError)
    await expect(llm.generateText()).rejects.toThrow(ModelTimeoutError)
    await expect(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: a minimal fake model
      for await (const _ of llm.streamText() as any) {
      }
    }).toThrow('The model stopped sending its answer')
  })
})

describe('turnWatchdog', () => {
  it('fails a turn with no new event', async () => {
    const w = turnWatchdog(30)
    await expect(w.stalled).rejects.toThrow('The answer stopped')
  })

  it('does not fail while events keep coming, or after stop', async () => {
    const w = turnWatchdog(40)
    let failed = false
    w.stalled.catch(() => {
      failed = true
    })
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 20))
      w.touch()
    }
    w.stop()
    await new Promise((r) => setTimeout(r, 80))
    expect(failed).toBe(false)
  })
})

describe('session error event', () => {
  it('does not throw when no page listens any more', () => {
    const s = SessionManager.createSession()
    expect(() => s.emit('error', { data: 'gone' })).not.toThrow()
    const seen: string[] = []
    s.subscribe((event, data) => seen.push(`${event}:${data.data}`))
    expect(seen).toEqual(['error:gone'])
  })
})

describe('settleInterruptedAnswers', () => {
  it('turns rows left answering into failed turns with the reason', () => {
    const db = new Database(':memory:')
    db.exec(`CREATE TABLE messages (id INTEGER PRIMARY KEY, chat_id TEXT,
      message_id TEXT, status TEXT, response_blocks TEXT)`)
    db.exec(`INSERT INTO messages (chat_id, message_id, status, response_blocks) VALUES
      ('c', 'm1', 'answering', '[]'),
      ('c', 'm2', 'answering', '[{"id":"t","type":"text","data":"partial"}]'),
      ('c', 'm3', 'completed', '[{"id":"t","type":"text","data":"done"}]')`)
    expect(settleInterruptedAnswers(db)).toBe(2)
    const rows = db
      .query('SELECT message_id, status, response_blocks FROM messages')
      .all() as {
      message_id: string
      status: string
      response_blocks: string
    }[]
    const byId = Object.fromEntries(rows.map((r) => [r.message_id, r]))
    expect(byId.m1.status).toBe('error')
    expect(JSON.parse(byId.m1.response_blocks)).toMatchObject([
      { type: 'error', data: INTERRUPTED_ANSWER_TEXT },
    ])
    expect(JSON.parse(byId.m2.response_blocks)).toMatchObject([
      { type: 'text', data: 'partial' },
      { type: 'error', data: INTERRUPTED_ANSWER_TEXT },
    ])
    expect(byId.m3.status).toBe('completed')
  })
})
