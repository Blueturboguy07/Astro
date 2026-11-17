import type { ScheduledJobRun } from './scheduleTypes'

const STALE_TIMEOUT_MS = 10 * 60 * 1000

export const INTERRUPTED_TEXT =
  'Interrupted: Astro or its background worker stopped while this task ran.'

/* A scheduled run never waits for ever (F-071): over 15 minutes in all, or
   5 minutes without any progress from the agent, it stops with a reason. */
export const RUN_LIMIT_MS = 15 * 60 * 1000
export const RUN_IDLE_MS = 5 * 60 * 1000
export const RUN_LIMIT_TEXT =
  'Stopped: the task ran longer than 15 minutes. Try a smaller task.'
export const runIdleText = (ms: number) =>
  `Stopped: no progress from the agent for ${Math.round(ms / 60_000)} minutes.`

/** reader.read() with a limit on the wait for the next piece. */
export async function readWithIdleLimit<T>(
  reader: { read(): Promise<ReadableStreamReadResult<T>> },
  idleMs: number,
): Promise<ReadableStreamReadResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(runIdleText(idleMs))), idleMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Runs that can no longer finish. When the browser or the background
 * worker starts, every "running" run is one that a closed browser or a
 * stopped worker cut off: the code that ran it is gone, and it stayed
 * "running" for ever (Astro 0.2.4 QA, F-026, F-071). Later, only runs past
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
