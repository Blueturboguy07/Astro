/* publik settles a paid answer a few seconds after the stream ends, so one
   read at the end of an answer still showed the old balance (Astro 0.2.4
   QA, F-089). The second read comes after refreshAccount's 10 s throttle. */
export const BALANCE_READ_DELAYS_MS = [0, 15_000] as const

/** Reads the balance now and once more after the charge has settled; returns a cancel function. */
export function readBalanceAfterAnswer(
  refresh: () => void,
  schedule: (fn: () => void, ms: number) => unknown = setTimeout,
  cancel: (id: unknown) => void = (id) =>
    clearTimeout(id as ReturnType<typeof setTimeout>),
): () => void {
  const timers = BALANCE_READ_DELAYS_MS.map((ms) => schedule(refresh, ms))
  return () => {
    for (const t of timers) cancel(t)
  }
}
