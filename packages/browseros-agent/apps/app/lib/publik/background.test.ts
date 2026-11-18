import { describe, expect, it, mock } from 'bun:test'
import type { GateState } from './publik'

/* F-092: the background opens the app with a small notice while publik
   answers 429 or 5xx, reads the wallet again on Retry or the alarm, and
   never shows the full-page gate while publik still does not answer. */

const storageValues = new Map<string, unknown>()
const gateWrites: GateState[] = []
mock.module('@wxt-dev/storage', () => ({
  storage: {
    defineItem: <T>(key: string, options?: { fallback?: T }) => ({
      getValue: async () =>
        storageValues.has(key) ? storageValues.get(key) : options?.fallback,
      setValue: async (value: T) => {
        if (key === 'session:publik-gate' && value) {
          gateWrites.push(value as unknown as GateState)
        }
        storageValues.set(key, value)
      },
      watch: () => () => {},
    }),
    getItem: async (key: string) => storageValues.get(key) ?? null,
    removeItem: async (key: string) => {
      storageValues.delete(key)
    },
  },
}))
mock.module('@/lib/env', () => ({
  env: {
    VITE_PUBLIK_APP_TOKEN: 'pat_astro_backgroundtest',
    VITE_PUBLIK_API_BASE_URL: 'https://publik.test/api/v1',
  },
}))
type Handler = (msg: { data: unknown }) => unknown
const handlers = new Map<string, Handler>()
mock.module('@/lib/messaging/runtime/runtimeMessages', () => ({
  RuntimeMessageType: {
    publikGate: 'publikGate',
    publikWake: 'publikWake',
    publikSelfTest: 'publikSelfTest',
    publikSync: 'publikSync',
    publikRefresh: 'publikRefresh',
    publikSignOut: 'publikSignOut',
  },
  onRuntimeMessage: (type: string, handler: Handler) => {
    handlers.set(type, handler)
  },
}))
const applied: (string | null)[] = []
mock.module('./providers', () => ({
  PROVIDER_SYNC_ALARM: 'publik-provider-sync',
  applyChoice: async (choice: string | null) => {
    applied.push(choice)
  },
  syncProviders: async () => {},
}))

const alarms = { created: [] as string[], cleared: [] as string[] }
;(globalThis as { chrome?: unknown }).chrome = {
  runtime: {
    getManifest: () => ({ version: '1.2.3' }),
    getPlatformInfo: async () => ({ os: 'mac', arch: 'arm64' }),
    getURL: (p: string) => `chrome-extension://astro/${p}`,
  },
  alarms: {
    get: async () => undefined,
    create: async (name: string) => {
      alarms.created.push(name)
    },
    clear: async (name: string) => {
      alarms.cleared.push(name)
      return true
    },
    onAlarm: { addListener: () => {} },
  },
  tabs: {
    query: async () => [],
    create: async () => ({}),
    update: async () => ({}),
  },
}

let walletStatus = 429
const walletCalls: string[] = []
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input)
  if (url.endsWith('/api/v1/wallet')) {
    walletCalls.push(url)
    if (walletStatus !== 200) {
      return Response.json(
        { error: { type: 'rate_limit_exceeded', message: 'Busy.' } },
        { status: walletStatus },
      )
    }
    return Response.json({
      claim_state: 'claimed',
      claim_url: null,
      account: { handle: 'mann' },
      plan: { kind: 'plan', label: 'Plus' },
      balance_micros: 0,
      top_up_url: 'https://publikhq.com/wallet',
      linked_at: null,
    })
  }
  return new Response(null, { status: 204 })
}) as typeof fetch

const gate = () => storageValues.get('session:publik-gate') as GateState | null
const until = async (ok: () => boolean) => {
  for (let i = 0; i < 200 && !ok(); i++) {
    await new Promise((r) => setTimeout(r, 10))
  }
  expect(ok()).toBe(true)
}
const pressRetry = () =>
  handlers.get('publikGate')?.({ data: { action: 'retry' } })

describe('the background while publik is not answering (F-092)', () => {
  it('opens the app with the notice, keeps it on Retry, and drops it once publik answers', async () => {
    /* An earlier sign-in with "Connect your plan". */
    storageValues.set('local:publik-credential', {
      key: 'pk_live_backgroundtest',
      base_url: 'https://publik.test/api/v1',
      install_id: 'i',
      claim_url: null,
    })
    storageValues.set('local:publik-choice', 'publik')
    storageValues.set('local:publik-account', {
      handle: 'mann',
      plan: { kind: 'plan', label: 'Plus' },
      balance_micros: 0,
      top_up_url: null,
      linked_at: null,
      seen_at: 0,
    })

    const { startPublik } = await import('./background')
    startPublik()
    await until(() => gate()?.status === 'done')
    const opened = gate()
    expect(opened).toMatchObject({
      status: 'done',
      notice: { message: 'publik is not answering.', status: 429 },
    })
    expect(applied).toEqual(['publik'])
    expect(alarms.created).toContain('publik-recheck')
    expect(gateWrites.some((s) => s.status === 'screen')).toBe(false)

    /* Retry while publik still answers 503: the notice stays, with a new time. */
    walletStatus = 503
    const before =
      opened?.status === 'done' ? (opened.notice?.at ?? 0) : Number.NaN
    await new Promise((r) => setTimeout(r, 5))
    const calls = walletCalls.length
    await pressRetry()
    await until(() => walletCalls.length > calls)
    await until(() => {
      const s = gate()
      return s?.status === 'done' && (s.notice?.at ?? 0) > before
    })
    expect(gate()).toMatchObject({ notice: { status: 503 } })
    /* The one write that is not "done" is the first start's "checking". */
    expect(gateWrites.filter((s) => s.status !== 'done')).toEqual([
      expect.objectContaining({ status: 'checking' }),
    ])

    /* publik answers: the notice goes away and the alarm stops. */
    walletStatus = 200
    await pressRetry()
    await until(() => {
      const s = gate()
      return s?.status === 'done' && !s.notice
    })
    expect(alarms.cleared).toContain('publik-recheck')
    expect(storageValues.get('local:publik-account')).toMatchObject({
      handle: 'mann',
    })
    expect(gateWrites.filter((s) => s.status === 'screen')).toEqual([])
  })
})
