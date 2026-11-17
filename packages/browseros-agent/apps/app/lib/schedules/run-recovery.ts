import type { ScheduledJobRun } from './scheduleTypes'

const STALE_TIMEOUT_MS = 10 * 60 * 1000

export const INTERRUPTED_TEXT =
  'Interrupted: Astro was closed while this task ran.'

/**
 * Runs that can no longer finish. At browser start every "running" run is
 * one the closed browser cut off: nothing is left to finish it, and it
 * stayed "running" forever (Astro 0.2.4 QA, F-026). Later, only runs past
 * the stale limit count.
 */
export function settleInterruptedRuns(
  runs: ScheduledJobRun[],
  now: number,
  atStartup: boolean,
): ScheduledJobRun[] {
  return runs.map((run) => {
    if (run.status !== 'running') return run
    const age = now - new Date(run.startedAt).getTime()
    if (!atStartup && age <= STALE_TIMEOUT_MS) return run
    const text = atStartup ? INTERRUPTED_TEXT : 'Job timed out!'
    return {
      ...run,
      status: 'failed' as const,
      completedAt: new Date(now).toISOString(),
      result: text,
      error: text,
    }
  })
}

/**
 * Waits until the local server answers /health. The catch-up run at
 * browser start went out before the server was up and failed with "Failed
 * to fetch" (F-026).
 */
export async function waitForAgentServer(
  baseUrl: () => Promise<string>,
  options: {
    fetchImpl?: typeof fetch
    tries?: number
    delayMs?: number
    signal?: AbortSignal
  } = {},
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch
  const tries = options.tries ?? 45
  const delayMs = options.delayMs ?? 2000
  for (let i = 0; i < tries; i++) {
    if (options.signal?.aborted) return
    try {
      const res = await fetchImpl(`${await baseUrl()}/health`, {
        signal: options.signal,
      })
      if (res.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
}
