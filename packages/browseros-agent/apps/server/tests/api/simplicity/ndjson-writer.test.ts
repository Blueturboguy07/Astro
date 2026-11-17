/**
 * Astro 0.2.4 QA, F-060: the server exited with code 1 after Stop or a
 * reload during an answer. The page cancels its reader; each later
 * write()/close() rejected, nobody caught it, and Bun ended the process.
 */
import { describe, expect, it } from 'bun:test'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { ndjsonWriter } from '../../../src/api/routes/simplicity/ndjson-writer'

describe('ndjsonWriter', () => {
  it('writes one JSON line per event', async () => {
    const stream = new TransformStream<Uint8Array, Uint8Array>()
    const out = ndjsonWriter(stream.writable)
    const text = new Response(stream.readable).text()
    out.write({ type: 'block', n: 1 })
    out.write({ type: 'messageEnd' })
    out.close()
    expect(await text).toBe('{"type":"block","n":1}\n{"type":"messageEnd"}\n')
  })

  it('Stop/reload mid-turn: writes and closes after the page went away cause no unhandled rejection', async () => {
    const rejections: unknown[] = []
    const onRejection = (r: unknown) => rejections.push(r)
    process.on('unhandledRejection', onRejection)
    try {
      const stream = new TransformStream<Uint8Array, Uint8Array>()
      const out = ndjsonWriter(stream.writable)
      const reader = stream.readable.getReader()
      out.write({ type: 'block', n: 1 })
      await reader.read()
      /* The page reloads: its reader is cancelled. */
      await reader.cancel('reload')
      for (let i = 0; i < 5; i++) out.write({ type: 'updateBlock', n: i })
      out.write({ type: 'messageEnd' })
      out.close()
      out.close()
      await new Promise((r) => setTimeout(r, 50))
      expect(rejections).toEqual([])
      expect(out.open).toBe(false)
    } finally {
      process.off('unhandledRejection', onRejection)
    }
  })
})

describe('installRejectionGuard', () => {
  it('keeps the server process running after an unhandled rejection', () => {
    const guard = path.resolve(
      import.meta.dir,
      '../../../src/lib/rejection-guard.ts',
    )
    const script = `
      const { installRejectionGuard } = await import(${JSON.stringify(guard)});
      installRejectionGuard((r) => console.log('logged:', r.message));
      Promise.reject(new Error('stream is closing or closed'));
      await new Promise((r) => setTimeout(r, 100));
      console.log('still running');
    `
    const res = spawnSync(process.execPath, ['-e', script], {
      encoding: 'utf8',
      timeout: 20_000,
    })
    expect(res.stdout).toContain('logged: stream is closing or closed')
    expect(res.stdout).toContain('still running')
    expect(res.status).toBe(0)
  })
})
