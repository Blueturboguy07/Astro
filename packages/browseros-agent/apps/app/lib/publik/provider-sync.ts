/**
 * Pure helpers for the publik connection of the answer engine (no storage,
 * no chrome APIs), so they can be unit-tested. providers.ts uses them.
 */
import type { Choice } from './publik'

export const PUBLIK_PROVIDER_NAME = 'publik API'
export type ServerProvider = {
  id: string
  name?: string
  type?: string
  config?: Record<string, unknown>
  chatModels?: { key: string; name: string }[]
}

/** The answer engine's publik entry, as `GET /api/providers` returns it. */
export const isPublikServerProvider = (
  p: { id?: string; name?: string; config?: Record<string, unknown> },
  serverProviderId?: string | null,
): boolean => {
  if (serverProviderId && p.id === serverProviderId) return true
  const base = p.config?.baseURL
  if (typeof base === 'string') {
    try {
      const host = new URL(base).hostname.toLowerCase()
      if (host === 'publikhq.com' || host.endsWith('.publikhq.com')) return true
    } catch {}
  }
  return p.name === PUBLIK_PROVIDER_NAME
}

/* Retries for the answer-engine entry (Astro 0.2.4 QA, F-078): on 1 of 3
   fresh Windows starts the local server was not ready at "Connect your
   plan", the one attempt failed and nothing tried again, so the home said
   "No AI connection yet" for good. After these the background arms an
   alarm (PROVIDER_SYNC_ALARM) and tries again every minute. */
export const SYNC_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000]
export const PROVIDER_SYNC_ALARM = 'publik-provider-sync'

/** Runs `attempt` until it succeeds, waiting `delays[i]` after failure i; stops early when `keepGoing` says no. */
export async function retryWithBackoff(
  attempt: () => Promise<boolean>,
  delays: readonly number[],
  keepGoing: () => Promise<boolean> = async () => true,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((r) => setTimeout(r, ms)),
): Promise<boolean> {
  for (let i = 0; ; i++) {
    if (!(await keepGoing())) return false
    if (await attempt()) return true
    if (i >= delays.length) return false
    await sleep(delays[i])
  }
}

/** What to do with the server's list: use the listed publik entry, or create one (dropping a stored id the server no longer lists). */
export function planServerEntry(
  listed: ServerProvider[],
  serverId: string | null,
): { use: ServerProvider } | { create: true; staleId: string | null } {
  const found = listed.find((p) => isPublikServerProvider(p, serverId))
  if (found) return { use: found }
  return { create: true, staleId: serverId }
}

/** "Connect your plan" shows unless the plan is chosen AND the answer engine has its connection (F-078). */
export const showConnectButton = (
  choice: Choice | null | undefined,
  connected: boolean | null,
): boolean => choice !== 'publik' || connected === false

/**
 * Deletes every publik entry the answer engine lists. False when the server
 * could not be asked or a delete failed, so the caller tries again: on a
 * Windows start the server was not ready at "Use my own key", the entry
 * stayed and the home still offered the publik model (F-091 a).
 */
export async function removePublikEntries(
  list: () => Promise<ServerProvider[] | null>,
  remove: (id: string) => Promise<boolean>,
  serverId: string | null,
): Promise<boolean> {
  let listed: ServerProvider[] | null
  try {
    listed = await list()
  } catch {
    return false
  }
  if (!listed) return false
  let ok = true
  for (const p of listed) {
    if (!isPublikServerProvider(p, serverId)) continue
    try {
      if (!(await remove(p.id))) ok = false
    } catch {
      ok = false
    }
  }
  return ok
}
