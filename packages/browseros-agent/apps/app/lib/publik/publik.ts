/* publik.ts — Sign in with publik, usage counting, and publik API as one provider option.
 *
 * The publik module (https://publikhq.com/sdk/publik.ts.md) for Astro's agent
 * extension. The background service worker runs it at browser start, before
 * any page of the app is usable (lib/publik/background.ts):
 *   `const gate = await ensureSignedIn(ui)`. It
 *   1. loads or provisions this computer's publik key (POST /api/v1/installs);
 *   2. shows Sign in with publik until GET /api/v1/wallet says "claimed" (no other way past it);
 *   3. when USES_AI: asks once how the app pays for AI and stores the answer (setChoice() changes it);
 *   4. starts usage counting: app_opened now, active_session every 30 minutes (POST /api/v1/telemetry).
 *
 * What differs from the reference module, because this is a browser extension
 * and not a Node process:
 *   - the credential file is an extension-storage item (local:publik-credential).
 *     Only the background writes it. Pages read the account summary
 *     (local:publik-account), never the key;
 *   - the app token is compiled in at build time (VITE_PUBLIK_APP_TOKEN, lib/env.ts);
 *   - the terminal UI is the gate page (screens/simplicity/Publik/PublikGate.tsx),
 *     wired through runtime messages in lib/publik/background.ts;
 *   - the 30-minute timer is a chrome.alarms alarm, because a service worker
 *     does not stay alive for a setInterval;
 *   - the self-test is reached by a URL, not an environment variable
 *     (RELEASING.md, "Usage counts and the self-test").
 * The words of the gate are the contract's, unchanged.
 */
import { storage } from '@wxt-dev/storage'
import { env } from '@/lib/env'

export const APP_SLUG = 'astro'
/** The CRX version: apps/app/package.json, through the manifest. */
export const APP_VERSION: string = manifestVersion()
/** false: the app calls no model. It still signs in and counts users; it skips the plan screen. */
export const USES_AI = true
const ORIGIN = originOf()
export const DEFAULT_BASE_URL = `${ORIGIN}/api/v1`
/** Ask for a tier, never a vendor model name. */
export const MODELS = {
  fast: 'publik-fast',
  balanced: 'publik-balanced',
  smart: 'publik-smart',
} as const
const POLL_MS = 3_000
const POLL_LIMIT_MS = 10 * 60_000
/** The alarm that sends active_session. lib/publik/background.ts listens for it. */
export const ACTIVE_SESSION_ALARM = 'publik-active-session'

export type Choice = 'publik' | 'own_key'
export interface PublikCredential {
  key: string
  base_url: string
  install_id: string
  claim_url: string | null
}
export interface Wallet {
  claim_state: 'anonymous' | 'claimed'
  claim_url: string | null
  account: { handle: string | null } | null
  plan: { kind: 'none' | 'plan' | 'pack'; label: string | null }
  balance_micros: number
  top_up_url: string
  linked_at: string | null
}
export type GateAction =
  | 'sign_in'
  | 'retry'
  | 'get_plan'
  | 'connect'
  | 'own_key'
export interface GateScreen {
  id: 'sign_in' | 'unreachable' | 'choose'
  title: string
  body: string
  note: string | null
  buttons: { action: GateAction; label: string }[]
}
/** show(): draw the screen and resolve with the button pressed. When `signal` aborts, close it (the promise may stay pending). */
export interface GateUI {
  show(screen: GateScreen, signal: AbortSignal): Promise<GateAction>
  openUrl(url: string): unknown
}
export type Provider =
  | { kind: 'own' | 'publik'; baseURL: string; apiKey: string }
  | { kind: 'needs_own_key' }
/** What the pages read after the gate: the account, never the key. */
export interface PublikAccount {
  handle: string | null
  plan: Wallet['plan']
  balance_micros: number
  top_up_url: string | null
  linked_at: string | null
  seen_at: number
}
/** The gate as the pages see it, for this browser session. */
export type GateState =
  | { status: 'checking'; at: number }
  | { status: 'screen'; screen: GateScreen; at: number }
  | { status: 'done'; at: number }

/* ---------- storage: the credential file and its neighbours ---------- */

/** The per-app credential file. Written by the background only. */
export const credentialStorage = storage.defineItem<PublikCredential | null>(
  'local:publik-credential',
  { fallback: null },
)
/** The person's answer to the plan screen; null asks again at the next start. */
export const choiceStorage = storage.defineItem<Choice | null>(
  'local:publik-choice',
  { fallback: null },
)
export const accountStorage = storage.defineItem<PublikAccount | null>(
  'local:publik-account',
  { fallback: null },
)
/** The gate screen of this browser session. Session storage: a new browser start runs the gate again. */
export const gateStorage = storage.defineItem<GateState | null>(
  'session:publik-gate',
  { fallback: null },
)
/** The last 402 the chat saw: its message and the one link. */
export const moneyStorage = storage.defineItem<{
  message: string
  url: string | null
} | null>('local:publik-402', { fallback: null })
/** `{ usage: false }` turns usage counting off (the consent.json of the reference module). */
export const telemetryConsentStorage = storage.defineItem<{
  usage: boolean
} | null>('local:publik-telemetry', { fallback: null })
const telemetryIdStorage = storage.defineItem<string | null>(
  'local:publik-telemetry-install-id',
  { fallback: null },
)
const telemetrySessionStorage = storage.defineItem<{
  opened_at: number
} | null>('session:publik-telemetry', { fallback: null })
/** Written on every poll tick: an extension API call keeps the service worker awake. */
const heartbeatStorage = storage.defineItem<number | null>(
  'session:publik-gate-heartbeat',
  { fallback: null },
)

function manifestVersion(): string {
  try {
    return chrome.runtime.getManifest().version
  } catch {
    return '0.0.0'
  }
}

function originOf(): string {
  try {
    const base = env.VITE_PUBLIK_API_BASE_URL || 'https://publikhq.com/api/v1'
    return base.replace(/\/+$/, '').replace(/\/api\/v1$/, '')
  } catch {
    return 'https://publikhq.com'
  }
}

/** The compiled-in app token (RELEASING.md §2), or "" in a dev or source build. */
function appToken(): string {
  try {
    return env.VITE_PUBLIK_APP_TOKEN?.trim() ?? ''
  } catch {
    return ''
  }
}

type PlatformInfo = {
  os: 'macos' | 'windows' | 'linux' | null
  arch: string | undefined
  device_name: string
}

/** macos, windows or linux; null on a system publik does not count. */
async function platformInfo(): Promise<PlatformInfo> {
  try {
    const info = await chrome.runtime.getPlatformInfo()
    const os =
      info.os === 'mac'
        ? 'macos'
        : info.os === 'win'
          ? 'windows'
          : info.os === 'linux'
            ? 'linux'
            : null
    const arch = info.arch === 'x86-64' ? 'x64' : info.arch
    return { os, arch, device_name: os ? `Astro on ${os}` : 'Astro' }
  } catch {
    return { os: null, arch: undefined, device_name: 'Astro' }
  }
}

export async function readCredential(): Promise<PublikCredential | null> {
  try {
    const c = await credentialStorage.getValue()
    return c && typeof c.key === 'string' && c.key.startsWith('pk_') ? c : null
  } catch {
    return null
  }
}
async function writeCredential(c: PublikCredential | null): Promise<void> {
  await credentialStorage.setValue(c)
}
/** The person's answer to the plan screen. Settings call it to change the answer; null asks again at the next start. */
export async function setChoice(choice: Choice | null): Promise<void> {
  await choiceStorage.setValue(choice)
}

/** The key this app uses: the stored choice decides. */
export async function resolveProvider(
  userKey?: { baseURL: string; apiKey: string } | null,
): Promise<Provider> {
  const c = await readCredential()
  if (c && (await choiceStorage.getValue()) === 'publik') {
    return {
      kind: 'publik',
      baseURL: c.base_url || DEFAULT_BASE_URL,
      apiKey: c.key,
    }
  }
  return userKey?.apiKey
    ? { kind: 'own', ...userKey }
    : { kind: 'needs_own_key' }
}

/* ---------- the publik API ---------- */

/** POST /api/v1/installs: this computer's publik key. Throws a readable message. */
export async function provision(): Promise<PublikCredential> {
  const token = appToken()
  if (!token.startsWith('pat_')) {
    throw new Error(
      'This build has no publik app token. Ask the developer for a new build.',
    )
  }
  const prior = await readCredential()
  const platform = await platformInfo()
  let installId = prior?.install_id ?? crypto.randomUUID()
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${ORIGIN}/api/v1/installs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        app_token: token,
        app_slug: APP_SLUG,
        app_version: APP_VERSION,
        os: platform.os ?? 'linux',
        arch: platform.arch,
        device_name: platform.device_name,
        install_id: installId,
        disclosure_version: 1,
        dialects: ['chat_completions'],
      }),
    })
    // biome-ignore lint/suspicious/noExplicitAny: the body is read field by field
    const body = (await res.json().catch(() => ({}))) as Record<string, any>
    const key: string | null =
      body.key ?? (res.status === 200 ? (prior?.key ?? null) : null)
    if ((res.status === 201 || res.status === 200) && key) {
      const c: PublikCredential = {
        key,
        base_url: body.base_url ?? DEFAULT_BASE_URL,
        install_id: body.install_id ?? installId,
        claim_url: body.claim_url ?? null,
      }
      await writeCredential(c) // the key reaches storage before anything else sees it
      return c
    }
    if (res.status === 200 || body.error?.type === 'install_revoked') {
      installId = crypto.randomUUID()
      continue
    }
    throw new Error(
      body.error?.message ??
        `publik could not set up this computer (${res.status}).`,
    )
  }
  throw new Error('publik could not set up this computer.')
}

/** GET /api/v1/wallet. 401: the key is gone (null wallet). Throws when publik is not reachable. */
export async function readWallet(
  key: string,
): Promise<{ status: number; wallet: Wallet | null; message: string | null }> {
  const res = await fetch(`${ORIGIN}/api/v1/wallet`, {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15_000),
  })
  // biome-ignore lint/suspicious/noExplicitAny: the body is read field by field
  const b = (await res.json().catch(() => ({}))) as Record<string, any>
  if (!res.ok || typeof b.claim_state !== 'string') {
    return {
      status: res.status,
      wallet: null,
      message: b.error?.message ?? null,
    }
  }
  return {
    status: res.status,
    message: null,
    wallet: {
      ...b,
      account: b.account ?? null,
      plan: b.plan ?? { kind: 'none', label: null },
      balance_micros: b.balance_micros ?? 0,
    } as Wallet,
  }
}

const dollars = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`
/** The words of the gate. The same in every publik module. */
export function gateScreen(
  id: GateScreen['id'],
  w: Wallet | null,
  note: string | null = null,
  message?: string,
): GateScreen {
  if (id === 'unreachable') {
    return {
      id,
      title: 'Sign in with publik',
      body: message ?? 'publik is not reachable. Check your connection.',
      note,
      buttons: [{ action: 'retry', label: 'Retry' }],
    }
  }
  if (id === 'sign_in') {
    return {
      id,
      title: 'Sign in with publik',
      note,
      buttons: [{ action: 'sign_in', label: 'Sign in with publik' }],
      body: 'This app uses your publik account. Click Sign in with publik, then sign in in your browser. This window continues when you are signed in.',
    }
  }
  const who = w?.account?.handle
    ? `You are signed in as @${w.account.handle}.`
    : 'You are signed in to publik.'
  if (!w || (w.plan.kind === 'none' && w.balance_micros === 0)) {
    return {
      id,
      title: 'Choose how to pay for AI',
      note,
      body: `${who} This app uses AI. Get a publik plan, or use your own key.`,
      buttons: [
        { action: 'get_plan', label: 'Get a plan' },
        { action: 'own_key', label: 'Use my own key' },
      ],
    }
  }
  const what =
    w.plan.kind === 'plan'
      ? `Your plan: ${w.plan.label ?? 'publik'}.`
      : `Your balance: ${dollars(w.balance_micros)}.`
  return {
    id,
    title: 'Connect your plan',
    note,
    body: `${who} ${what} Connect it to use AI in this app, or use your own key.`,
    buttons: [
      { action: 'connect', label: 'Connect your plan' },
      { action: 'own_key', label: 'Use my own key' },
    ],
  }
}

/** Show a screen; with `poll`, also poll GET /wallet every 3 s for at most 10 minutes. "done": the poll saw it; "timeout": it did not. */
async function ask(
  ui: GateUI,
  screen: GateScreen,
  poll?: { key: string; until: (w: Wallet) => boolean },
): Promise<GateAction | 'done' | 'timeout'> {
  const stop = new AbortController()
  const run = async (
    p: NonNullable<typeof poll>,
  ): Promise<'done' | 'timeout'> => {
    for (
      const end = Date.now() + POLL_LIMIT_MS;
      Date.now() < end && !stop.signal.aborted;
    ) {
      await new Promise((r) => setTimeout(r, POLL_MS))
      if (stop.signal.aborted) break
      await heartbeatStorage.setValue(Date.now()).catch(() => null)
      const w = await readWallet(p.key).then(
        (r) => r.wallet,
        () => null,
      )
      if (w && p.until(w)) return 'done'
    }
    return 'timeout'
  }
  try {
    return await Promise.race([
      ui.show(screen, stop.signal),
      ...(poll ? [run(poll)] : []),
    ])
  } finally {
    stop.abort()
  }
}

const offline = (e: unknown) =>
  e instanceof TypeError ||
  (e instanceof Error && /abort|timeout/i.test(e.name))

/** The gate (see the top of the file). Resolves once the person is signed in; `choice` is null when USES_AI is false. */
export async function ensureSignedIn(
  ui: GateUI,
): Promise<{ key: string; wallet: Wallet; choice: Choice | null }> {
  let signNote: string | null = null
  let signPoll = true
  let planNote: string | null = null
  let planPoll = false
  for (;;) {
    let c: PublikCredential
    let r: Awaited<ReturnType<typeof readWallet>>
    try {
      c = (await readCredential()) ?? (await provision())
      r = await readWallet(c.key)
    } catch (e) {
      await ask(
        ui,
        gateScreen(
          'unreachable',
          null,
          null,
          offline(e) ? undefined : String((e as Error).message),
        ),
      )
      continue
    }
    if (r.status === 401) {
      await writeCredential(null) // a revoked key: provision again
      continue
    }
    const w = r.wallet
    if (!w) {
      await ask(
        ui,
        gateScreen('unreachable', null, null, r.message ?? undefined),
      )
      continue
    }
    if (w.claim_state !== 'claimed') {
      const a = await ask(
        ui,
        gateScreen('sign_in', w, signNote),
        signPoll
          ? { key: c.key, until: (x) => x.claim_state === 'claimed' }
          : undefined,
      )
      if (a === 'sign_in') {
        ui.openUrl(w.claim_url ?? c.claim_url ?? `${ORIGIN}/wallet`)
        signNote = 'Waiting for you to sign in in your browser.'
        signPoll = true
      }
      if (a === 'timeout') {
        signNote =
          'No sign-in after 10 minutes. Click Sign in with publik to try again.'
        signPoll = false
      }
      continue
    }
    let choice: Choice | null = USES_AI ? await choiceStorage.getValue() : null
    if (USES_AI && !choice) {
      if (w.plan.kind !== 'none' || w.balance_micros > 0) {
        planNote = null // the plan is there: Connect your plan
        planPoll = false
      }
      const a = await ask(
        ui,
        gateScreen('choose', w, planNote),
        planPoll
          ? {
              key: c.key,
              until: (x) => x.plan.kind !== 'none' || x.balance_micros > 0,
            }
          : undefined,
      )
      planNote = null
      planPoll = false
      if (a === 'get_plan') {
        ui.openUrl(w.top_up_url)
        planNote = 'Waiting for your plan. Finish in your browser.'
        planPoll = true
      }
      if (a === 'timeout') {
        planNote = 'No plan after 10 minutes. Click Get a plan to try again.'
      }
      if (a !== 'connect' && a !== 'own_key') continue // "done": the plan is there; the next screen is Connect your plan
      choice = a === 'connect' ? 'publik' : 'own_key'
      await setChoice(choice)
    }
    await accountStorage.setValue({
      handle: w.account?.handle ?? null,
      plan: w.plan,
      balance_micros: w.balance_micros,
      top_up_url: w.top_up_url ?? null,
      linked_at: w.linked_at ?? null,
      seen_at: Date.now(),
    })
    await startTelemetry()
    return { key: c.key, wallet: w, choice }
  }
}

/** Builder check, run by the BUILT extension: the self-test page prints this line (RELEASING.md). */
export async function selfTest(): Promise<string> {
  try {
    const r = await readWallet((await provision()).key)
    if (!r.wallet) {
      throw new Error(r.message ?? `GET /wallet answered ${r.status}`)
    }
    return `publik self-test: ok ${APP_SLUG} ${APP_VERSION}`
  } catch (e) {
    return `publik self-test: failed: ${
      offline(e)
        ? 'publik is not reachable. Check your connection.'
        : e instanceof Error
          ? e.message
          : String(e)
    }`
  }
}

/* ---------- usage counting: /skills/telemetry.md sections 3-5 ---------- */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

async function usageOff(): Promise<boolean> {
  try {
    return (await telemetryConsentStorage.getValue())?.usage === false
  } catch {
    return false
  }
}
/** One random UUID per browser profile. An extension cannot read the publik folder other apps share. */
async function telemetryInstallId(): Promise<string> {
  const saved = (await telemetryIdStorage.getValue().catch(() => null))
    ?.trim()
    .toLowerCase()
  if (saved && UUID_RE.test(saved)) return saved
  const fresh = crypto.randomUUID()
  await telemetryIdStorage.setValue(fresh).catch(() => null) // if it cannot be saved, this ID lasts for this run only
  return fresh
}
/** Send and forget: a failure, a 404 and an opt-out never reach the user. */
export async function sendEvent(
  event: 'app_opened' | 'active_session',
): Promise<void> {
  const say = (result: unknown) => {
    // biome-ignore lint/suspicious/noConsole: the one debug line of /skills/telemetry.md §6, in the service worker's console
    console.debug(`publik-telemetry: ${event} -> ${result}`)
  }
  try {
    const p = await platformInfo()
    if (!p.os) return
    if (await usageOff()) return say('off (opt-out)')
    const key = (await readCredential())?.key
    const body = {
      v: 1,
      app: APP_SLUG,
      install_id: await telemetryInstallId(),
      event,
      app_version: APP_VERSION.replace(/^v/i, ''),
      os: p.os,
      ...(p.arch === 'arm64' || p.arch === 'x64' ? { arch: p.arch } : {}),
    }
    const res = await fetch(`${ORIGIN}/api/v1/telemetry`, {
      method: 'POST',
      signal: AbortSignal.timeout(5_000),
      headers: {
        'content-type': 'application/json',
        ...(key?.startsWith('pk_') ? { authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify(body),
    })
    say(res.status)
  } catch (e) {
    say(e instanceof Error ? e.name : 'error')
  }
}
/** Called by ensureSignedIn(). app_opened once per browser session, active_session every 30 minutes; never throws. */
export async function startTelemetry(): Promise<void> {
  const session = await telemetrySessionStorage.getValue().catch(() => null)
  if (session?.opened_at) {
    await ensureActiveSessionAlarm(false)
    return
  }
  await telemetrySessionStorage
    .setValue({ opened_at: Date.now() })
    .catch(() => null)
  await ensureActiveSessionAlarm(true)
  void sendEvent('app_opened')
}
/** The first active_session is 30 minutes after app_opened (`reset`); a restarted worker only makes sure the alarm exists. */
async function ensureActiveSessionAlarm(reset: boolean): Promise<void> {
  try {
    if (!reset && (await chrome.alarms.get(ACTIVE_SESSION_ALARM))) return
    await chrome.alarms.create(ACTIVE_SESSION_ALARM, { periodInMinutes: 30 })
  } catch {
    /* no alarms API (tests): the session still counts its open */
  }
}

/* ---------- publik API calls ---------- */

/** OpenAI-compatible client config: new OpenAI(clientConfig(p)). */
export function clientConfig(p: Extract<Provider, { apiKey: string }>) {
  return { baseURL: p.baseURL, apiKey: p.apiKey }
}

/** A 402 renders its message plus exactly ONE link: this one. */
export function topUpUrlFrom402(body: unknown): {
  message: string
  url: string | null
} {
  const e = (
    body as { error?: { message?: string; top_up_url?: string } } | null
  )?.error
  return {
    message: e?.message ?? 'Not enough publik API balance.',
    url: e?.top_up_url ?? null,
  }
}

/** Only publikhq.com may be opened from a publik button. A response is input: anything else is dropped. */
export function publikLink(url: unknown): string | null {
  if (typeof url !== 'string' || !url) return null
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase()
  if (host !== 'publikhq.com' && !host.endsWith('.publikhq.com')) return null
  if (u.username || u.password) return null
  return u.toString()
}

/* The chat relays a provider failure as one string. A gateway 402 reads
   "402 <message>" through the OpenAI SDK; when the app pays with publik,
   remember it so the chat can show the message with its one link. */
export async function note402(message: unknown): Promise<boolean> {
  if (typeof message !== 'string') return false
  const m = message.trim()
  if (
    !m ||
    !/\b402\b|insufficient[_ ]credit|not enough publik|publik balance is too low/i.test(
      m,
    )
  ) {
    return false
  }
  if ((await choiceStorage.getValue()) !== 'publik') return false
  const account = await accountStorage.getValue().catch(() => null)
  await moneyStorage.setValue({
    message: m.replace(/^\s*(?:error:\s*)?402\s*[:-]?\s*/i, ''),
    url: publikLink(account?.top_up_url) ?? null,
  })
  return true
}
export async function clear402(): Promise<void> {
  await moneyStorage.setValue(null)
}
