/* SIDEPANEL-INPUT-CLEARS: the harness queries (GET /agents, GET
 * /agents/adapters) feed the side panel's first-load spinner. react-query's
 * `isLoading` is `isPending && isFetching`, and a query that never got data
 * goes back to `pending` on every refetch. The agents list polls every 5 s,
 * so a server that answers it with an error (an upstream BrowserOS migration
 * dropped `agent_definitions` from the shared ~/.browseros DB: 500 "no such
 * table") turned "loading" on again every 5 s, and the side panel swapped the
 * chat, with the person's half-typed prompt, for a spinner. */

type QueryLoadingFlags = {
  isLoading: boolean
  /** react-query: the query has had at least one answer, data or error. */
  isFetched: boolean
}

/** Loading only until the query's first answer (data or error); a background refetch is never "loading". */
export function isFirstLoad(query: QueryLoadingFlags): boolean {
  return query.isLoading && !query.isFetched
}

type PollState = {
  status: 'pending' | 'error' | 'success'
  data: unknown
  errorUpdateCount: number
}

export const HARNESS_POLL_MS = 5_000
export const HARNESS_POLL_AFTER_ERROR_MS = 60_000

/** The agents-list poll: every 5 s while it answers, once a minute while it fails (a broken endpoint is not asked 4 times every 5 s). */
export function harnessPollInterval(state: PollState): number {
  const failing =
    state.status === 'error' ||
    (state.data === undefined && state.errorUpdateCount > 0)
  return failing ? HARNESS_POLL_AFTER_ERROR_MS : HARNESS_POLL_MS
}
