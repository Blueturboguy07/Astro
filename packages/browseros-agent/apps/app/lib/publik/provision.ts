import { apiFetch } from '@/lib/simplicity/api-fetch'
import {
  DEFAULT_PROVIDER_ID,
  defaultProviderIdStorage,
  loadProviders,
  providersStorage,
} from '../llm-providers/storage'
import type { LlmProviderConfig } from '../llm-providers/types'
import {
  disclosureAccepted,
  hasAppToken,
  type PublikEnv,
  publikEnv,
  readState,
  writeState,
} from './state'
import {
  DISCLOSURE_VERSION,
  type InstallResponse,
  PUBLIK_AGENT_PROVIDER_ID,
  PUBLIK_APP_SLUG,
  PUBLIK_KEY_RE,
  PUBLIK_MODEL_DEFAULTS,
  PUBLIK_PROVIDER_NAME,
  PUBLIK_TIER_NAMES,
  PUBLIK_TIER_ORDER,
  type PublikState,
  type PublikTier,
  type WalletResponse,
} from './types'

/* First-launch provisioning against `POST /installs` (CONTRACT §3.2),
 * done by the extension itself — the least fragile seam Astro has: it
 * ships inside the re-cut dmg, needs no Chromium change, no file written
 * before first launch and no UI automation (R29 §1.4, D34).
 *
 * Rules, each pinned by provision.test.ts:
 *   - Consent precedes mint [S4]: nothing is sent until the disclosure has
 *     been accepted (`acceptDisclosure`). Never at extension start.
 *   - A user-entered key always wins; an existing publik connection is left
 *     alone; a declined install stays declined. Never overwrite.
 *   - The key lands in the two credential stores the app already has:
 *     the answer engine's config.json through the local server's
 *     `POST /api/providers` (+ `/models` for the three aliases) and the
 *     browser agent's chrome.storage `llm-providers` list. `publik-state`
 *     holds state only, never the key.
 *   - `base_url` and `models` from the response are honoured over the
 *     compiled defaults [S8].
 *   - Without a compiled-in app token (dev, source builds) every path here
 *     is a no-op.
 *   - Never throws: an offline first launch is normal.
 */

export type ProvisionDeps = {
  env?: PublikEnv
  fetch?: typeof fetch
  /* The local agent server (same-origin shim); injected by tests. */
  apiFetch?: typeof apiFetch
  now?: () => Date
  timeoutMs?: number
  installId?: () => string
  platform?: () => Promise<PlatformInfo>
  appVersion?: () => string
}

export type PlatformInfo = {
  os: 'macos' | 'windows' | 'linux'
  os_version?: string
  arch?: string
  device_name?: string
}

export type ProvisionResult =
  | 'active'
  | 'no-token'
  | 'declined'
  | 'disconnected'
  | 'consent-required'
  | 'failed'

const defaultPlatform = async (): Promise<PlatformInfo> => {
  try {
    const info = await chrome.runtime.getPlatformInfo()
    const os =
      info.os === 'mac' ? 'macos' : info.os === 'win' ? 'windows' : 'linux'
    return {
      os,
      arch: info.arch,
      device_name: os === 'macos' ? 'Astro on macOS' : `Astro on ${os}`,
    }
  } catch {
    return { os: 'macos' }
  }
}

const defaultAppVersion = (): string => {
  try {
    return chrome.runtime.getManifest().version
  } catch {
    return '0.0.0'
  }
}

const baseUrlOf = (env: PublikEnv) =>
  (env.baseUrl ?? 'https://publikhq.com/api/v1').replace(/\/+$/, '')

const tierModels = (
  models: InstallResponse['models'],
): Partial<Record<PublikTier, string>> | undefined => {
  if (!models || typeof models !== 'object') return undefined
  const out: Partial<Record<PublikTier, string>> = {}
  for (const tier of PUBLIK_TIER_ORDER) {
    const v = models[tier]
    if (typeof v === 'string' && /^[a-z0-9._:/-]{1,64}$/i.test(v)) out[tier] = v
  }
  return Object.keys(out).length ? out : undefined
}

/* The alias list the provider serves: response-supplied names first, the
   compiled defaults for anything the response left out. */
export const publikModels = (
  state: PublikState | null | undefined,
): Record<PublikTier, string> => ({
  ...PUBLIK_MODEL_DEFAULTS,
  ...(state?.models ?? {}),
})

/* The browser agent's entry (`openai-compatible`, R08 §15): the store that
   /settings/ai and the browser-use tools read. */
export const agentProvider = async (): Promise<LlmProviderConfig | null> => {
  const providers = await loadProviders()
  return providers.find((p) => p.id === PUBLIK_AGENT_PROVIDER_ID) ?? null
}

/* The key, read back from the agent store for GET /wallet. Never logged. */
export const publikKey = async (): Promise<string | null> => {
  const p = await agentProvider()
  return p?.apiKey && PUBLIK_KEY_RE.test(p.apiKey) ? p.apiKey : null
}

/* The answer engine's entry, as `GET /api/providers` returns it. */
export const isPublikServerProvider = (
  p: { id?: string; name?: string; config?: Record<string, unknown> },
  state?: PublikState | null,
): boolean => {
  if (state?.serverProviderId && p.id === state.serverProviderId) return true
  const base = p.config?.baseURL
  if (typeof base === 'string') {
    try {
      const host = new URL(base).hostname.toLowerCase()
      if (host === 'publikhq.com' || host.endsWith('.publikhq.com')) return true
    } catch {}
  }
  return p.name === PUBLIK_PROVIDER_NAME
}

const upsertAgentProvider = async (
  key: string,
  baseUrl: string,
  models: Record<PublikTier, string>,
  now: number,
) => {
  const current = (await providersStorage.getValue()) || []
  const existing = current.find((p) => p.id === PUBLIK_AGENT_PROVIDER_ID)
  const entry: LlmProviderConfig = {
    id: PUBLIK_AGENT_PROVIDER_ID,
    type: 'openai-compatible',
    name: PUBLIK_PROVIDER_NAME,
    baseUrl,
    modelId: existing?.modelId ?? models.balanced,
    apiKey: key,
    supportsImages: true,
    contextWindow: existing?.contextWindow ?? 200000,
    temperature: existing?.temperature ?? 0.2,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  const next = existing
    ? current.map((p) => (p.id === PUBLIK_AGENT_PROVIDER_ID ? entry : p))
    : [...current, entry]
  await providersStorage.setValue(next)

  /* Pre-filled, and selected only when nothing else was: the built-in
     placeholder points at upstream's hosted service, which this fork has
     no account with, so it is not a working choice to preserve. A provider
     the user picked themselves is left in place. */
  const currentDefault = await defaultProviderIdStorage.getValue()
  if (!currentDefault || currentDefault === DEFAULT_PROVIDER_ID) {
    await defaultProviderIdStorage.setValue(PUBLIK_AGENT_PROVIDER_ID)
  }
}

const removeAgentProvider = async () => {
  const current = (await providersStorage.getValue()) || []
  if (!current.some((p) => p.id === PUBLIK_AGENT_PROVIDER_ID)) return
  await providersStorage.setValue(
    current.filter((p) => p.id !== PUBLIK_AGENT_PROVIDER_ID),
  )
  const currentDefault = await defaultProviderIdStorage.getValue()
  if (currentDefault === PUBLIK_AGENT_PROVIDER_ID) {
    await defaultProviderIdStorage.setValue(DEFAULT_PROVIDER_ID)
  }
}

type ServerProvider = {
  id: string
  name?: string
  type?: string
  config?: Record<string, unknown>
  chatModels?: { key: string; name: string }[]
}

/* Registers (or completes) the answer engine's provider on the local
   server. Idempotent and separate from the mint so a server that is still
   starting on first launch does not lose the key: the card calls this again
   on every mount while `serverProviderId` is unset. Returns the provider id
   or null when the server could not be reached. */
export async function ensureAnswerEngineProvider(
  deps: ProvisionDeps = {},
): Promise<string | null> {
  const call = deps.apiFetch ?? apiFetch
  const state = await readState()
  if (state?.state !== 'active') return null
  const key = await publikKey()
  if (!key) return null
  const agent = await agentProvider()
  const baseURL = agent?.baseUrl ?? baseUrlOf(deps.env ?? publikEnv())
  const models = publikModels(state)

  try {
    const listRes = await call('/api/providers')
    if (!listRes.ok) return null
    const listed: ServerProvider[] =
      ((await listRes.json()) as { providers?: ServerProvider[] }).providers ??
      []
    let provider = listed.find((p) => isPublikServerProvider(p, state))

    if (!provider) {
      const res = await call('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'openai',
          name: PUBLIK_PROVIDER_NAME,
          config: { apiKey: key, baseURL },
        }),
      })
      if (!res.ok) return null
      provider = (await res.json()).provider as ServerProvider
      if (!provider?.id) return null
    }

    /* The `openai` type lists defaults only for api.openai.com; any other
       base URL shows exactly the models config.json names (R29 §1.4 fact
       1), so the three aliases are added explicitly. */
    const have = new Set((provider.chatModels ?? []).map((m) => m.key))
    for (const tier of PUBLIK_TIER_ORDER) {
      const modelKey = models[tier]
      if (have.has(modelKey)) continue
      const res = await call(`/api/providers/${provider.id}/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'chat',
          key: modelKey,
          name: `publik ${PUBLIK_TIER_NAMES[tier]}`,
        }),
      })
      if (!res.ok) return null
    }

    if (state.serverProviderId !== provider.id) {
      await writeState({ serverProviderId: provider.id })
    }
    return provider.id
  } catch {
    return null
  }
}

const removeAnswerEngineProvider = async (deps: ProvisionDeps) => {
  const call = deps.apiFetch ?? apiFetch
  const state = await readState()
  try {
    const listRes = await call('/api/providers')
    if (!listRes.ok) return
    const listed: ServerProvider[] =
      ((await listRes.json()) as { providers?: ServerProvider[] }).providers ??
      []
    for (const p of listed) {
      if (!isPublikServerProvider(p, state)) continue
      await call(`/api/providers/${p.id}`, { method: 'DELETE' })
    }
  } catch {
    /* Best effort: the key is gone from the agent store either way, and
       the server entry is removed the next time the card sees it. */
  }
}

const mint = async (
  installId: string,
  deps: ProvisionDeps,
  env: PublikEnv,
): Promise<{
  status: number
  body: InstallResponse | null
  retryAfter: string | null
}> => {
  const token = env.token ?? ''
  const platform = await (deps.platform ?? defaultPlatform)()
  const state = await readState()

  const res = await (deps.fetch ?? fetch)(`${baseUrlOf(env)}/installs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      app_token: token,
      app_slug: PUBLIK_APP_SLUG,
      app_version: (deps.appVersion ?? defaultAppVersion)(),
      os: platform.os,
      os_version: platform.os_version,
      arch: platform.arch,
      device_name: platform.device_name,
      install_id: installId,
      disclosure_version: state?.disclosureVersion ?? DISCLOSURE_VERSION,
      dialects: ['chat_completions'],
    }),
    signal: AbortSignal.timeout(deps.timeoutMs ?? 8_000),
  })

  let body: InstallResponse | null = null
  try {
    body = (await res.json()) as InstallResponse
  } catch {
    body = null
  }
  return {
    status: res.status,
    body,
    retryAfter: res.headers.get('retry-after'),
  }
}

/* GET /wallet → state fields. Shared by the mint (which may carry a wallet)
   and wallet.ts. */
export const walletPatch = (w: WalletResponse): Partial<PublikState> => {
  const balance = w.balance_micros ?? w.available_micros
  const patch: Partial<PublikState> = {
    walletSeenAt: Date.now(),
  }
  if (typeof balance === 'number') patch.balanceMicros = balance
  if (w.claim_state === 'claimed' || w.claim_state === 'anonymous')
    patch.claimState = w.claim_state
  if (w.starter && typeof w.starter.remaining_micros === 'number')
    patch.starterRemainingMicros = w.starter.remaining_micros
  else if (w.starter === null) patch.starterRemainingMicros = 0
  if (w.week) {
    if (typeof w.week.used_micros === 'number')
      patch.weekUsedMicros = w.week.used_micros
    patch.weekBudgetMicros =
      typeof w.week.budget_micros === 'number' ? w.week.budget_micros : null
    if (typeof w.week.resets_at === 'string')
      patch.weekResetsAt = w.week.resets_at
  }
  if (typeof w.claim_url === 'string') patch.claimUrl = w.claim_url
  if (typeof w.add_credit_url === 'string')
    patch.addCreditUrl = w.add_credit_url
  if (typeof w.top_up_url === 'string') patch.topUpUrl = w.top_up_url
  /* Usage available again clears the last 402. */
  if (typeof balance === 'number' && balance > 0) patch.creditError = undefined
  return patch
}

const failureText = (err: unknown): string => {
  const e = err as { name?: string; message?: string } | undefined
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError')
    return 'publik API did not answer in time'
  return String(e?.message ?? err).slice(0, 120)
}

/* Step 3 of ensureProvisioned: a validated 201 → both credential stores and
   the state record. `body.key` has already passed PUBLIK_KEY_RE. */
const storeMintedKey = async (
  body: InstallResponse & { key: string },
  installId: string,
  env: PublikEnv,
  deps: ProvisionDeps,
) => {
  const baseUrl =
    typeof body.base_url === 'string' && /^https?:\/\//.test(body.base_url)
      ? body.base_url.replace(/\/+$/, '')
      : baseUrlOf(env)
  const models = { ...PUBLIK_MODEL_DEFAULTS, ...tierModels(body.models) }
  const now = deps.now ?? (() => new Date())

  /* 3. The existing credential stores, through their existing APIs. The
        agent store first — it is local to the extension and cannot be
        "still starting" — then the answer engine. */
  await upsertAgentProvider(body.key, baseUrl, models, now().getTime())

  const starter =
    body.starter_micros ?? body.balance_micros ?? body.starting_credit_micros
  await writeState({
    state: 'active',
    installId,
    serverProviderId: undefined,
    claimUrl: typeof body.claim_url === 'string' ? body.claim_url : undefined,
    claimCode:
      typeof body.claim_code === 'string' ? body.claim_code : undefined,
    claimState: body.claim_state === 'claimed' ? 'claimed' : 'anonymous',
    models: tierModels(body.models),
    starterMicros: typeof starter === 'number' ? starter : undefined,
    /* The first-run card's balance line (CONTRACT §12.1 (a)) reads the
       mint response until GET /wallet answers. */
    balanceMicros: typeof starter === 'number' ? starter : undefined,
    starterRemainingMicros: typeof starter === 'number' ? starter : undefined,
    creditError: undefined,
    mintedAt: now().toISOString(),
    lastError: undefined,
    retryAfter: undefined,
    ...(body.wallet ? walletPatch(body.wallet) : {}),
  })
}

/* Idempotent. Safe to call from the accept/retry actions and after a
   `key_revoked` answer. Returns the reason it did nothing so the caller
   (and the tests) can tell the cases apart. */
export async function ensureProvisioned(
  deps: ProvisionDeps = {},
): Promise<ProvisionResult> {
  const env = deps.env ?? publikEnv()

  /* 1. Never overwrite. */
  const state = await readState()
  if (state?.state === 'active' && (await publikKey())) {
    await ensureAnswerEngineProvider(deps)
    return 'active'
  }
  if (state?.state === 'declined') return 'declined'
  if (state?.state === 'disconnected') return 'disconnected'
  if (!hasAppToken(env)) return 'no-token'
  /* 2. Consent precedes mint. */
  if (!disclosureAccepted(state)) return 'consent-required'

  const newId = deps.installId ?? (() => crypto.randomUUID())
  let installId = state?.installId ?? newId()
  if (!state?.installId) await writeState({ installId, state: 'pending' })

  try {
    let { status, body, retryAfter } = await mint(installId, deps, env)

    /* Replay [B1]: the server knows this install_id but cannot return the
       old secret. We have no credential (or we would have returned at
       step 1), so mint a fresh install once. */
    if (status === 200 && (!body || body.key == null)) {
      installId = newId()
      await writeState({ installId, state: 'pending' })
      ;({ status, body, retryAfter } = await mint(installId, deps, env))
    }

    if (status === 401 || status === 403) {
      await writeState({ state: 'pending', lastError: 'app token rejected' })
      return 'failed'
    }
    if (status === 429) {
      await writeState({
        state: 'pending',
        lastError: 'too many installs right now',
        retryAfter: retryAfter ?? undefined,
      })
      return 'failed'
    }
    if (status !== 201 && status !== 200) {
      throw new Error(`installs returned ${status}`)
    }
    if (
      !body ||
      typeof body.key !== 'string' ||
      !PUBLIK_KEY_RE.test(body.key)
    ) {
      throw new Error('installs returned a malformed key')
    }

    await storeMintedKey({ ...body, key: body.key }, installId, env, deps)
    await ensureAnswerEngineProvider(deps)
    return 'active'
  } catch (err) {
    /* Offline first launch is normal. Leave the card on Retry. Only the
       HTTP status text is stored — never a body, never a key. */
    await writeState({ state: 'pending', lastError: failureText(err) })
    return 'failed'
  }
}

/* The disclosure's "Continue" button. Recording acceptance is what unlocks
   the mint; the two happen together so the card sees `active` on return. */
export async function acceptDisclosure(deps: ProvisionDeps = {}) {
  await writeState({ disclosureVersion: DISCLOSURE_VERSION })
  return ensureProvisioned(deps)
}

/* The first-run card's "Later" (and its plan button): records that the
   balance line, the justification and the CTA were shown (CONTRACT §12.4,
   "never a silent starter"). Touches nothing else — the key stays, the
   starter stays, and the button stays in Settings. */
export async function acknowledgeCta(deps: ProvisionDeps = {}) {
  if (!(await readState())) return
  await writeState({
    ctaSeenAt: (deps.now ?? (() => new Date()))().toISOString(),
  })
}

/* "Use my own key instead" — from the card, from Settings' remove, or from
   a 402 banner. Removes both connections and pins the choice. */
export async function declinePublik(deps: ProvisionDeps = {}) {
  await removeAnswerEngineProvider(deps)
  await removeAgentProvider()
  await writeState({
    state: 'declined',
    serverProviderId: undefined,
    creditError: undefined,
    lastError: undefined,
  })
}

/* "Reconnect" after a decline or a disconnect: back to pending with a fresh
   install identity (the old one was either never minted or was revoked by
   the user's own hand), then the disclosure shows again. */
export async function resetPublik(deps: ProvisionDeps = {}) {
  await removeAnswerEngineProvider(deps)
  await removeAgentProvider()
  const newId = deps.installId ?? (() => crypto.randomUUID())
  /* No disclosureVersion: acceptance is per install, so the sheet shows
     again before anything is sent. */
  await writeState({
    installId: newId(),
    state: 'pending',
    disclosureVersion: undefined,
    serverProviderId: undefined,
    claimUrl: undefined,
    claimCode: undefined,
    addCreditUrl: undefined,
    topUpUrl: undefined,
    claimState: undefined,
    models: undefined,
    starterMicros: undefined,
    balanceMicros: undefined,
    starterRemainingMicros: undefined,
    weekUsedMicros: undefined,
    weekBudgetMicros: undefined,
    weekResetsAt: undefined,
    walletSeenAt: undefined,
    creditError: undefined,
    mintedAt: undefined,
    ctaSeenAt: undefined,
    lastError: undefined,
    retryAfter: undefined,
  })
}

/* Retry after an offline / rate-limited mint — same install id, same
   consent. */
export async function retryPublik(deps: ProvisionDeps = {}) {
  const state = await readState()
  if (state?.state === 'pending')
    await writeState({ lastError: undefined, retryAfter: undefined })
  return ensureProvisioned(deps)
}

/* `401 key_revoked` semantics (CONTRACT §1 [B2]):
     reprovision:true  — the idle sweep took the key; mint again with the
                         SAME install_id, silently. Consent already given.
     reprovision:false — the user revoked this computer from the dashboard;
                         drop the dead key and stop. Reconnect is a user
                         action. */
export async function handleKeyRevoked(
  reprovision: boolean,
  deps: ProvisionDeps = {},
): Promise<ProvisionResult> {
  await removeAnswerEngineProvider(deps)
  await removeAgentProvider()
  if (!reprovision) {
    await writeState({
      state: 'disconnected',
      serverProviderId: undefined,
      lastError: 'removed from your publik account',
    })
    return 'disconnected'
  }
  await writeState({
    state: 'pending',
    serverProviderId: undefined,
    lastError: undefined,
  })
  return ensureProvisioned(deps)
}
