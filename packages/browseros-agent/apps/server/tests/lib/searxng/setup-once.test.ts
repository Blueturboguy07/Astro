/**
 * @license
 * Copyright 2026 publik
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * F-002 (Astro 0.2.4 QA): the first web search on a clean home failed with
 * "Command failed: …/python3 -m pip install …" (SIGKILL), and every new
 * question downloaded again. The log showed two setups running at once, each
 * deleting the tree the other was executing, and nothing on screen. These
 * cover the pieces that fix it: one setup at a time, a clear error that
 * names the signal, and the progress/error steps in the answer.
 */

import { describe, expect, it } from 'bun:test'
import {
  runProcess,
  type SearchSetupStatus,
  singleFlight,
} from '../../../src/lib/searxng/provision'
import { ensureWebSearchReady } from '../../../src/lib/simplicity/agents/search/researcher/actions/search/webSearchSetup'
import type { ResearchBlock } from '../../../src/lib/simplicity/types'

describe('singleFlight', () => {
  it('runs one job for many concurrent callers', async () => {
    let runs = 0
    const go = singleFlight(async () => {
      runs++
      await new Promise((r) => setTimeout(r, 20))
      return 'url'
    })
    const all = await Promise.all([go(), go(), go(), go(), go()])
    expect(all).toEqual(['url', 'url', 'url', 'url', 'url'])
    expect(runs).toBe(1)
  })

  /* F-002: each automatic retry put one more Gatekeeper dialog on the
     person's screen. A failure stays until Retry (reset). */
  it('never runs again after a failure until reset', async () => {
    let runs = 0
    const go = singleFlight(async () => {
      runs++
      throw new Error('the download failed')
    })
    await expect(go()).rejects.toThrow('the download failed')
    await expect(go()).rejects.toThrow('the download failed')
    await expect(go()).rejects.toThrow('the download failed')
    expect(runs).toBe(1)
    go.reset()
    await expect(go()).rejects.toThrow('the download failed')
    expect(runs).toBe(2)
  })

  it('runs again after a success when called later', async () => {
    let runs = 0
    const go = singleFlight(async () => ++runs)
    expect(await go()).toBe(1)
    expect(await go()).toBe(2)
  })
})

describe('runProcess', () => {
  it('resolves on exit code 0', async () => {
    await runProcess('/bin/sh', ['-c', 'exit 0'], { timeoutMs: 5_000 })
  })

  it('names the signal when the system stops the process', async () => {
    await expect(
      runProcess('/bin/sh', ['-c', 'echo boom >&2; kill -9 $$'], {
        timeoutMs: 5_000,
      }),
    ).rejects.toThrow(/stopped by the system \(SIGKILL\): boom/)
  })

  it('names the exit code and the end of stderr', async () => {
    await expect(
      runProcess(
        '/bin/sh',
        ['-c', 'echo "No matching distribution" >&2; exit 1'],
        {
          timeoutMs: 5_000,
        },
      ),
    ).rejects.toThrow(/exited with code 1: No matching distribution/)
  })

  it('stops a process that runs too long', async () => {
    await expect(
      runProcess('/bin/sh', ['-c', 'sleep 5'], { timeoutMs: 100 }),
    ).rejects.toThrow(/timed out/)
  })
})

const researchBlock = (): ResearchBlock => ({
  id: 'r1',
  type: 'research',
  data: { subSteps: [] },
})

const fakeStatus = () => {
  const listeners = new Set<(s: SearchSetupStatus) => void>()
  return {
    emit: (s: SearchSetupStatus) => {
      for (const cb of listeners) cb(s)
    },
    onStatus: (cb: (s: SearchSetupStatus) => void) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}

describe('ensureWebSearchReady', () => {
  it('does nothing when search already runs', async () => {
    const block = researchBlock()
    const ok = await ensureWebSearchReady(
      block,
      { updateBlock: () => {} },
      { configuredURL: () => '', runningURL: () => 'http://127.0.0.1:1' },
    )
    expect(ok).toBe(true)
    expect(block.data.subSteps).toHaveLength(0)
  })

  it('shows the setup progress as a step', async () => {
    const block = researchBlock()
    const status = fakeStatus()
    const updates: unknown[] = []
    let t = 0
    const ok = await ensureWebSearchReady(
      block,
      { updateBlock: (_id, patch) => updates.push(patch) },
      {
        configuredURL: () => '',
        runningURL: () => null,
        onStatus: status.onStatus,
        now: () => (t += 1000),
        startSearch: async () => {
          status.emit({
            state: 'setting_up',
            step: 'python',
            percent: 40,
            message:
              'Setting up web search (one time, about 150 MB): downloading Python 40%',
          })
          return 'http://127.0.0.1:1'
        },
      },
    )
    expect(ok).toBe(true)
    expect(updates.length).toBeGreaterThan(0)
    expect(block.data.subSteps).toEqual([
      expect.objectContaining({
        type: 'notice',
        level: 'info',
        text: 'Web search is set up',
      }),
    ])
  })

  /* Patched-app retest: a question asked while pip ran saw no step, because
     no new status came until the next step. */
  it('shows the step already running when the question arrives', async () => {
    const block = researchBlock()
    let seenDuringSetup: unknown[] = []
    await ensureWebSearchReady(
      block,
      { updateBlock: () => {} },
      {
        configuredURL: () => '',
        runningURL: () => null,
        onStatus: fakeStatus().onStatus,
        currentStatus: () => ({
          state: 'setting_up',
          step: 'dependencies',
          percent: 0,
          message: 'Installing search dependencies',
        }),
        startSearch: async () => {
          seenDuringSetup = structuredClone(block.data.subSteps)
          return 'http://127.0.0.1:1'
        },
      },
    )
    expect(seenDuringSetup).toEqual([
      expect.objectContaining({
        type: 'notice',
        text: 'Installing search dependencies',
      }),
    ])
  })

  it('shows one clear error step when setup fails, however often it is asked', async () => {
    const block = researchBlock()
    const deps = {
      configuredURL: () => '',
      runningURL: () => null,
      onStatus: fakeStatus().onStatus,
      startSearch: async (): Promise<string> => {
        throw new Error(
          'Web search is not available: python3 -m pip install was stopped by the system (SIGKILL).',
        )
      },
    }
    const session = { updateBlock: () => {} }
    expect(await ensureWebSearchReady(block, session, deps)).toBe(false)
    expect(await ensureWebSearchReady(block, session, deps)).toBe(false)
    const errors = block.data.subSteps.filter(
      (s) => s.type === 'notice' && s.level === 'error',
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({
      text: 'Web search is not available: python3 -m pip install was stopped by the system (SIGKILL). This answer uses no web sources. Astro does not retry the setup by itself: press Retry to try once more.',
      action: 'retry-search-setup',
    })
  })
})
