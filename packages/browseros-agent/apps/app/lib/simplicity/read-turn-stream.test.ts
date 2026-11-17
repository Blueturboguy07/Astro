import { describe, expect, it } from 'bun:test'
import {
  needsReconnect,
  readTurnStream,
  statusAtEnd,
} from './read-turn-stream'

const streamOf = (...parts: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const p of parts) c.enqueue(new TextEncoder().encode(p))
      c.close()
    },
  })

describe('readTurnStream (F-059, F-060)', () => {
  it('settles on messageEnd', async () => {
    const seen: unknown[] = []
    const out = await readTurnStream(
      streamOf('{"type":"block","n":1}\n', '{"type":"messageEnd"}\n'),
      (e) => seen.push(e.type),
    )
    expect(out).toBe('settled')
    expect(seen).toEqual(['block', 'messageEnd'])
  })

  it('settles on an error line', async () => {
    expect(
      await readTurnStream(streamOf('{"type":"error","data":"x"}\n'), () => {}),
    ).toBe('settled')
  })

  it('is lost when the server stops without an end (crash, dropped turn)', async () => {
    expect(
      await readTurnStream(streamOf('{"type":"block","n":1}\n'), () => {}),
    ).toBe('lost')
  })

  it('applies a line split across chunks once', async () => {
    const seen: number[] = []
    await readTurnStream(
      streamOf('{"type":"block","n":1}\n{"type":"bl', 'ock","n":2}\n'),
      (e) => seen.push(e.n as number),
    )
    expect(seen).toEqual([1, 2])
  })
})

describe('needsReconnect', () => {
  it('skips a turn this page streams, reconnects one it does not', () => {
    const live = new Set(['m1'])
    expect(needsReconnect({ status: 'answering', messageId: 'm1' }, live)).toBe(false)
    expect(needsReconnect({ status: 'answering', messageId: 'm2' }, live)).toBe(true)
    expect(needsReconnect({ status: 'completed', messageId: 'm2' }, live)).toBe(false)
    expect(needsReconnect(undefined, live)).toBe(false)
  })
})

describe('statusAtEnd (F-059 reload before any text)', () => {
  it('keeps the cancelled status the server sends on messageEnd', () => {
    expect(statusAtEnd({ status: 'cancelled' })).toBe('cancelled')
    expect(statusAtEnd({ status: 'completed' })).toBe('completed')
    /* An older server sends no status. */
    expect(statusAtEnd({})).toBe('completed')
  })
})
