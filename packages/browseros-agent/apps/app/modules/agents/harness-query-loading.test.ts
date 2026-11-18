import { describe, expect, it } from 'bun:test'
import {
  QueryClient,
  QueryObserver,
  type QueryObserverResult,
} from '@tanstack/react-query'
import { showChatLayoutSpinner } from '../../components/layout/chat-layout-gate'
import {
  HARNESS_POLL_AFTER_ERROR_MS,
  HARNESS_POLL_MS,
  harnessPollInterval,
  isFirstLoad,
} from './harness-query-loading'

/* SIDEPANEL-INPUT-CLEARS: GET /agents answers 500 ("no such table:
   agent_definitions") on every poll. Drive react-query's real observer
   through first load + background refetches, feed its flags to the side
   panel's layout gate, and count how often the composer would unmount. */
async function agentsPollFlags(polls: number) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const observer = new QueryObserver<unknown, Error>(client, {
    queryKey: ['agent-harness-agents', 'http://127.0.0.1:9516'],
    queryFn: async () => {
      throw new Error('no such table: agent_definitions')
    },
  })
  const flags: QueryObserverResult<unknown, Error>[] = []
  const unsubscribe = observer.subscribe((r) => flags.push(r))
  await observer.refetch()
  for (let i = 0; i < polls; i++) await observer.refetch()
  unsubscribe()
  const state = client.getQueryCache().find({
    queryKey: ['agent-harness-agents', 'http://127.0.0.1:9516'],
  })?.state
  client.clear()
  return { flags, state }
}

/** How often the chat (and its composer) is replaced by the spinner after it first showed. */
function composerUnmounts(
  loading: boolean[],
  gate: (isLoading: boolean, chatShown: boolean) => boolean,
): number {
  let chatShown = false
  let mounted = false
  let unmounts = 0
  for (const isLoading of loading) {
    const spinner = gate(isLoading, chatShown)
    if (!spinner) chatShown = true
    if (mounted && spinner) unmounts++
    mounted = !spinner
  }
  return unmounts
}

describe('harness query loading (side panel composer)', () => {
  it('react-query reports isLoading again on each refetch of a query that never got data', async () => {
    const { flags } = await agentsPollFlags(3)
    const firstError = flags.findIndex((r) => r.isError)
    expect(firstError).toBeGreaterThan(0)
    const laterLoading = flags.slice(firstError).filter((r) => r.isLoading)
    expect(laterLoading.length).toBe(3)
  })

  it('isFirstLoad is true only until the first answer', async () => {
    const { flags } = await agentsPollFlags(3)
    const firstError = flags.findIndex((r) => r.isError)
    expect(flags.slice(0, firstError).some(isFirstLoad)).toBe(true)
    expect(flags.slice(firstError).some(isFirstLoad)).toBe(false)
  })

  it('old rule unmounts the composer on every poll; the fix never does', async () => {
    const { flags } = await agentsPollFlags(5)
    const oldGate = (isLoading: boolean) => isLoading
    expect(
      composerUnmounts(
        flags.map((r) => r.isLoading),
        oldGate,
      ),
    ).toBe(5)
    expect(
      composerUnmounts(flags.map(isFirstLoad), showChatLayoutSpinner),
    ).toBe(0)
    /* Second line of defence: even the raw flag cannot bring the spinner back once the chat showed. */
    expect(
      composerUnmounts(
        flags.map((r) => r.isLoading),
        showChatLayoutSpinner,
      ),
    ).toBe(0)
  })

  it('the agents poll slows to once a minute while it fails', async () => {
    const { state } = await agentsPollFlags(1)
    expect(state).toBeDefined()
    if (!state) return
    expect(harnessPollInterval(state)).toBe(HARNESS_POLL_AFTER_ERROR_MS)
    /* During a refetch the failed query is "pending" again; it still counts as failing. */
    expect(harnessPollInterval({ ...state, status: 'pending' })).toBe(
      HARNESS_POLL_AFTER_ERROR_MS,
    )
    expect(
      harnessPollInterval({
        status: 'success',
        data: { agents: [] },
        errorUpdateCount: 0,
      }),
    ).toBe(HARNESS_POLL_MS)
    expect(
      harnessPollInterval({
        status: 'pending',
        data: undefined,
        errorUpdateCount: 0,
      }),
    ).toBe(HARNESS_POLL_MS)
  })
})

describe('showChatLayoutSpinner', () => {
  it('shows the spinner only before the chat first showed', () => {
    expect(showChatLayoutSpinner(true, false)).toBe(true)
    expect(showChatLayoutSpinner(false, false)).toBe(false)
    expect(showChatLayoutSpinner(true, true)).toBe(false)
  })
})
