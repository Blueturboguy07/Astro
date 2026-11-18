import { storage } from '@wxt-dev/storage'
import {
  DEFAULT_PROVIDER_ID,
  defaultProviderIdStorage,
  providersStorage,
} from '@/lib/llm-providers/storage'
import { apiFetch } from '@/lib/simplicity/api-fetch'
import {
  isPublikAgentProviderId,
  PUBLIK_AGENT_PROVIDER_ID,
} from './agent-provider-ids'
import {
  agentProviderAfterFastRemoved,
  defaultAfterPublikRemoved,
  withPublikAgentProviders,
} from './agent-provider-list'
import {
  isPublikServerProvider,
  PROVIDER_SYNC_ALARM,
  PUBLIK_PROVIDER_NAME,
  planServerEntry,
  removePublikEntries,
  retryWithBackoff,
  type ServerProvider,
  SYNC_RETRY_DELAYS_MS,
} from './provider-sync'
import {
  type Choice,
  choiceStorage,
  DEFAULT_BASE_URL,
  MODELS,
  readCredential,
} from './publik'

export { isPublikServerProvider, PROVIDER_SYNC_ALARM }

/* Where the install key goes when the person chose "Connect your plan":
 * the two provider stores the app already has. The browser agent reads
 * chrome.storage.local['llm-providers']; the answer engine reads
 * ~/.browseros/simplicity/config.json through the local server's
 * /api/providers. "Use my own key" removes both entries; the person's own
 * connections are never touched, so bring-your-own-key works exactly as
 * before. Only the background calls this (lib/publik/background.ts). */

const TIERS: { model: string; name: string }[] = [
  { model: MODELS.balanced, name: 'publik Balanced' },
  { model: MODELS.fast, name: 'publik Fast' },
  { model: MODELS.smart, name: 'publik Smart' },
]

/* The answer-engine provider id the local server assigned: GET /providers
   drops a connection whose model list failed to load, so without this a
   retry would create a second copy. */
export const publikServerProviderIdStorage = storage.defineItem<string | null>(
  'local:publik-server-provider-id',
  { fallback: null },
)

/** When the background last applied the choice to the local server. */
export const publikProvidersAppliedAtStorage = storage.defineItem<number>(
  'local:publik-providers-applied-at',
  { fallback: 0 },
)

async function upsertAgentProvider(baseUrl: string, key: string) {
  const current = (await providersStorage.getValue()) || []
  await providersStorage.setValue(
    withPublikAgentProviders(current, baseUrl, key),
  )
  /* Selected only when nothing else was: the built-in placeholder points at
     upstream's hosted service, which this fork has no account with. A
     provider the person picked themselves stays. */
  const currentDefault = await defaultProviderIdStorage.getValue()
  if (!currentDefault || currentDefault === DEFAULT_PROVIDER_ID) {
    await defaultProviderIdStorage.setValue(PUBLIK_AGENT_PROVIDER_ID)
  }
  const fromFast = agentProviderAfterFastRemoved(currentDefault)
  if (fromFast) await defaultProviderIdStorage.setValue(fromFast)
}

async function removeAgentProvider() {
  const current = (await providersStorage.getValue()) || []
  if (!current.some((p) => isPublikAgentProviderId(p.id))) return
  const remaining = current.filter((p) => !isPublikAgentProviderId(p.id))
  await providersStorage.setValue(remaining)
  if (isPublikAgentProviderId(await defaultProviderIdStorage.getValue())) {
    await defaultProviderIdStorage.setValue(
      defaultAfterPublikRemoved(remaining),
    )
  }
}

/** True/false: the answer engine has / lacks the publik entry; null: the local server did not answer. */
export async function hasAnswerEngineProvider(): Promise<boolean | null> {
  try {
    const listed = await listServerProviders()
    if (!listed) return null
    const serverId = await publikServerProviderIdStorage.getValue()
    return listed.some((p) => isPublikServerProvider(p, serverId))
  } catch {
    return null
  }
}

async function listServerProviders(): Promise<ServerProvider[] | null> {
  const res = await apiFetch('/api/providers')
  if (!res.ok) return null
  return (
    ((await res.json()) as { providers?: ServerProvider[] }).providers ?? []
  )
}

/* Idempotent. A server that is still starting makes this return false;
   apply() retries it (retryWithBackoff, then the alarm). */
async function ensureAnswerEngineProvider(
  baseURL: string,
  key: string,
): Promise<boolean> {
  try {
    const listed = await listServerProviders()
    if (!listed) return false
    const serverId = await publikServerProviderIdStorage.getValue()
    const plan = planServerEntry(listed, serverId)
    let provider = 'use' in plan ? plan.use : undefined
    if ('create' in plan && plan.staleId) {
      /* A stored id the server does not list: the old code counted it as
         done, so a lost entry was never written again. Remove what may be
         left of it (one copy at a time) and write a new one. */
      await apiFetch(`/api/providers/${plan.staleId}`, {
        method: 'DELETE',
      }).catch(() => null)
      await publikServerProviderIdStorage.setValue(null)
    }
    if (!provider) {
      const res = await apiFetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'openai',
          name: PUBLIK_PROVIDER_NAME,
          config: { apiKey: key, baseURL },
        }),
      })
      if (!res.ok) return false
      provider = (await res.json()).provider as ServerProvider
      if (!provider?.id) return false
    }
    /* The `openai` type lists defaults only for api.openai.com; any other
       base URL shows exactly the models config.json names, so the three
       tiers are added by name. */
    const have = new Set((provider.chatModels ?? []).map((m) => m.key))
    for (const tier of TIERS) {
      if (have.has(tier.model)) continue
      const res = await apiFetch(`/api/providers/${provider.id}/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'chat',
          key: tier.model,
          name: tier.name,
        }),
      })
      if (!res.ok) return false
    }
    if (serverId !== provider.id) {
      await publikServerProviderIdStorage.setValue(provider.id)
    }
    return true
  } catch {
    return false
  }
}

async function removeAnswerEngineProvider(): Promise<boolean> {
  const ok = await removePublikEntries(
    listServerProviders,
    async (id) =>
      (await apiFetch(`/api/providers/${id}`, { method: 'DELETE' })).ok,
    await publikServerProviderIdStorage.getValue(),
  )
  if (ok) await publikServerProviderIdStorage.setValue(null)
  return ok
}

async function armSyncAlarm(on: boolean) {
  try {
    if (on) {
      await chrome.alarms.create(PROVIDER_SYNC_ALARM, { delayInMinutes: 1 })
    } else {
      await chrome.alarms.clear(PROVIDER_SYNC_ALARM)
    }
  } catch {}
}

let chain: Promise<void> = Promise.resolve()

/** The stored choice, applied to the two provider stores. Calls run one after the other. */
export function applyChoice(choice: Choice | null): Promise<void> {
  chain = chain.then(() => apply(choice)).catch(() => undefined)
  return chain
}

async function apply(choice: Choice | null): Promise<void> {
  const c = choice === 'publik' ? await readCredential() : null
  if (c) {
    await upsertAgentProvider(c.base_url || DEFAULT_BASE_URL, c.key)
    const ok = await retryWithBackoff(
      () => ensureAnswerEngineProvider(c.base_url || DEFAULT_BASE_URL, c.key),
      SYNC_RETRY_DELAYS_MS,
      async () => (await choiceStorage.getValue()) === 'publik',
    )
    await armSyncAlarm(!ok && (await choiceStorage.getValue()) === 'publik')
    await markApplied()
    return
  }
  await removeAgentProvider()
  const removed = await retryWithBackoff(
    removeAnswerEngineProvider,
    SYNC_RETRY_DELAYS_MS,
    async () => (await choiceStorage.getValue()) !== 'publik',
  )
  await armSyncAlarm(!removed && (await choiceStorage.getValue()) !== 'publik')
  await markApplied()
}

/* The open home re-reads the server's list when this changes. The stored
   server id alone was not enough: when it was already null, removing the
   entry changed nothing a page could watch (F-091 a). */
async function markApplied() {
  try {
    await publikProvidersAppliedAtStorage.setValue(Date.now())
  } catch {}
}

/** The settings card and the chat call this through the background when the server may have been starting. */
export async function syncProviders(): Promise<void> {
  await applyChoice(await choiceStorage.getValue())
}
