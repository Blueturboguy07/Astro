import { describe, expect, it } from 'bun:test'
import {
  INTERRUPTED_TEXT,
  settleInterruptedRuns,
  waitForAgentServer,
} from './run-recovery'
import type { ScheduledJobRun } from './scheduleTypes'

const run = (
  id: string,
  status: ScheduledJobRun['status'],
  startedAt: number,
) =>
  ({
    id,
    jobId: 'j',
    status,
    startedAt: new Date(startedAt).toISOString(),
  }) as ScheduledJobRun

/* Astro 0.2.4 QA, F-026. */
describe('settleInterruptedRuns', () => {
  const now = Date.parse('2026-11-17T10:00:00Z')

  it('at browser start fails every run that was still running', () => {
    const out = settleInterruptedRuns(
      [run('a', 'running', now - 60_000), run('b', 'completed', now - 60_000)],
      now,
      true,
    )
    expect(out[0]).toMatchObject({ status: 'failed', result: INTERRUPTED_TEXT })
    expect(out[1]?.status).toBe('completed')
  })

  it('otherwise only fails runs past the stale limit', () => {
    const out = settleInterruptedRuns(
      [
        run('a', 'running', now - 60_000),
        run('b', 'running', now - 11 * 60_000),
      ],
      now,
      false,
    )
    expect(out[0]?.status).toBe('running')
    expect(out[1]?.status).toBe('failed')
  })
})

describe('waitForAgentServer', () => {
  it('waits until /health answers', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      if (calls < 3) throw new TypeError('Failed to fetch')
      return new Response('ok')
    }) as unknown as typeof fetch
    await waitForAgentServer(async () => 'http://127.0.0.1:1', {
      fetchImpl,
      delayMs: 1,
    })
    expect(calls).toBe(3)
  })

  it('gives up after the tries', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    await waitForAgentServer(async () => 'http://x', {
      fetchImpl,
      tries: 4,
      delayMs: 1,
    })
    expect(calls).toBe(4)
  })
})
