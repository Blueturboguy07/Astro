import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { GateUI } from './publik'

/* The module against a fake publik that answers /installs, /wallet and
   /telemetry, with a scripted UI that presses the buttons. The words are
   the contract's (publik's tests/publik-module-gate.test.ts pins them on
   the reference module; this pins them on Astro's copy). */

/* Extension storage, in memory. */
const storageValues = new Map<string, unknown>()
mock.module('@wxt-dev/storage', () => ({
  storage: {
    defineItem: <T>(key: string, options?: { fallback?: T }) => ({
      getValue: async () =>
        storageValues.has(key) ? storageValues.get(key) : options?.fallback,
      setValue: async (value: T) => {
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

let baseUrl = ''
let token: string | undefined = 'pat_astro_gatetest'
mock.module('@/lib/env', () => ({
  env: {
    get VITE_PUBLIK_APP_TOKEN() {
      return token
    },
    get VITE_PUBLIK_API_BASE_URL() {
      return baseUrl
    },
  },
}))

/* The two chrome APIs the module reads. */
;(globalThis as { chrome?: unknown }).chrome = {
  runtime: {
    getManifest: () => ({ version: '1.2.3' }),
    getPlatformInfo: async () => ({ os: 'mac', arch: 'arm64' }),
  },
  alarms: {
    get: async () => undefined,
    create: async () => {},
  },
}

type Wallet = {
  claim_state: 'anonymous' | 'claimed'
  account: { handle: string | null } | null
  plan: { kind: 'none' | 'plan' | 'pack'; label: string | null }
  balance_micros: number
}
const anonymous: Wallet = {
  claim_state: 'anonymous',
  account: null,
  plan: { kind: 'none', label: null },
  balance_micros: 0,
}
const claimedEmpty: Wallet = {
  claim_state: 'claimed',
  account: { handle: 'mann' },
  plan: { kind: 'none', label: null },
  balance_micros: 0,
}
const claimedPlan: Wallet = {
  claim_state: 'claimed',
  account: { handle: 'mann' },
  plan: { kind: 'plan', label: 'Plus' },
  balance_micros: 0,
}

const WORDS = {
  title: 'Sign in with publik',
  signInBody:
    'This app uses your publik account. Click Sign in with publik, then sign in in your browser. This window continues when you are signed in.',
  signInButton: 'Sign in with publik',
  waiting: 'Waiting for you to sign in in your browser.',
  unreachable: 'publik is not reachable. Check your connection.',
  retry: 'Retry',
  chooseTitle: 'Choose how to pay for AI',
  chooseBody: 'This app uses AI. Get a publik plan, or use your own key.',
  getPlan: 'Get a plan',
  ownKey: 'Use my own key',
  connectTitle: 'Connect your plan',
  connectBody: 'Connect it to use AI in this app, or use your own key.',
  connect: 'Connect your plan',
} as const

type Request = {
  method: string
  url: string
  auth: string | null
  body: string
}
const requests: Request[] = []
let wallets: Wallet[] = [anonymous]
let walletStatus = 200
let installsStatus = 201
let telemetryStatus = 204
let walletOkAfterInstalls = Number.POSITIVE_INFINITY
let origin = ''
let server: ReturnType<typeof Bun.serve>

type Mod = typeof import('./publik')
let m: Mod

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    async fetch(req) {
      const url = new URL(req.url)
      const body = await req.text()
      requests.push({
        method: req.method,
        url: url.pathname,
        auth: req.headers.get('authorization'),
        body,
      })
      const json = (status: number, data: unknown) =>
        new Response(JSON.stringify(data), {
          status,
          headers: { 'content-type': 'application/json' },
        })
      if (url.pathname === '/api/v1/installs') {
        if (installsStatus !== 201) {
          return json(installsStatus, {
            error: {
              type: 'invalid_app_token',
              message: 'This app token is not valid.',
            },
          })
        }
        const installs = requests.filter(
          (r) => r.url === '/api/v1/installs',
        ).length
        if (installs >= walletOkAfterInstalls) walletStatus = 200
        return json(201, {
          key: 'pk_live_gatetest',
          install_id: JSON.parse(body).install_id,
          claim_url: `${origin}/claim/abc`,
          claim_state: 'anonymous',
        })
      }
      if (url.pathname === '/api/v1/wallet') {
        if (walletStatus !== 200) {
          return json(walletStatus, {
            error: { type: 'invalid_key', message: 'This key is not valid.' },
          })
        }
        const w =
          (wallets.length > 1 ? wallets.shift() : wallets[0]) ?? anonymous
        return json(200, {
          ...w,
          claim_url: `${origin}/claim/abc`,
          top_up_url: `${origin}/wallet?top_up=1`,
          linked_at: null,
        })
      }
      if (url.pathname === '/api/v1/telemetry') {
        return new Response(null, { status: telemetryStatus })
      }
      return json(404, {})
    },
  })
  origin = `http://127.0.0.1:${server.port}`
  baseUrl = `${origin}/api/v1`
  m = await import('./publik')
})

afterAll(() => {
  server.stop(true)
})

beforeEach(() => {
  storageValues.clear()
  requests.length = 0
  wallets = [anonymous]
  walletStatus = 200
  installsStatus = 201
  telemetryStatus = 204
  walletOkAfterInstalls = Number.POSITIVE_INFINITY
  token = 'pat_astro_gatetest'
})

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Screen = {
  title: string
  body: string
  note: string | null
  buttons: string[]
}

/** Presses a button by screen title, or the first button of a screen with no note; otherwise waits for the gate to close it. Gives up after 6 screens of one title. */
function harness(press: Record<string, string> = {}) {
  const screens: Screen[] = []
  const opened: string[] = []
  const seen: Record<string, number> = {}
  const ui: GateUI = {
    show(s) {
      screens.push({
        title: s.title,
        body: s.body,
        note: s.note,
        buttons: s.buttons.map((b) => b.label),
      })
      seen[s.title] = (seen[s.title] ?? 0) + 1
      if (seen[s.title] > 6) return Promise.reject(new Error('gave up'))
      const want = press[s.title]
      if (want) {
        const b = s.buttons.find((x) => x.label === want)
        return b
          ? Promise.resolve(b.action)
          : Promise.reject(new Error(`no button ${want}`))
      }
      if (!s.note) return Promise.resolve(s.buttons[0]?.action ?? 'retry')
      return new Promise(() => {})
    },
    openUrl(url) {
      opened.push(url)
    },
  }
  return { ui, screens, opened }
}

const telemetry = () => requests.filter((r) => r.url === '/api/v1/telemetry')

describe('the module is what the publik scan looks for', () => {
  const code = readFileSync(path.join(import.meta.dir, 'publik.ts'), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\/\*|\*)/.test(line))
    .join('\n')

  it('holds the three strings outside comments', () => {
    for (const word of [
      '/api/v1/installs',
      '/api/v1/telemetry',
      'app_opened',
    ]) {
      expect(code).toContain(word)
    }
  })

  it('sets APP_SLUG to "astro" as a literal, and USES_AI to true', () => {
    const slugs = [
      ...code.matchAll(
        /\bAPP_SLUG\s*(?::\s*[^=\n]{1,40}?)?\s*=(?!=)\s*(["'`])([^"'`\n]{1,80})\1/g,
      ),
    ].map((x) => x[2])
    expect(slugs).toEqual(['astro'])
    expect(code).toMatch(/USES_AI = true/)
  })

  it('exports the slug and the manifest version', () => {
    expect(m.APP_SLUG).toBe('astro')
    expect(m.APP_VERSION).toBe('1.2.3')
  })
})

describe('the gate shows the contract words', () => {
  it('sign in, unreachable, choose, connect', () => {
    expect(m.gateScreen('sign_in', null)).toEqual({
      id: 'sign_in',
      title: WORDS.title,
      body: WORDS.signInBody,
      note: null,
      buttons: [{ action: 'sign_in', label: WORDS.signInButton }],
    })
    expect(m.gateScreen('unreachable', null)).toEqual({
      id: 'unreachable',
      title: WORDS.title,
      body: WORDS.unreachable,
      note: null,
      buttons: [{ action: 'retry', label: WORDS.retry }],
    })
    const w = (x: Wallet) =>
      ({
        ...x,
        claim_url: null,
        top_up_url: '',
        linked_at: null,
      }) as Parameters<typeof m.gateScreen>[1]
    expect(m.gateScreen('choose', w(claimedEmpty))).toEqual({
      id: 'choose',
      title: WORDS.chooseTitle,
      body: `You are signed in as @mann. ${WORDS.chooseBody}`,
      note: null,
      buttons: [
        { action: 'get_plan', label: WORDS.getPlan },
        { action: 'own_key', label: WORDS.ownKey },
      ],
    })
    expect(m.gateScreen('choose', w(claimedPlan))).toEqual({
      id: 'choose',
      title: WORDS.connectTitle,
      body: `You are signed in as @mann. Your plan: Plus. ${WORDS.connectBody}`,
      note: null,
      buttons: [
        { action: 'connect', label: WORDS.connect },
        { action: 'own_key', label: WORDS.ownKey },
      ],
    })
    expect(
      m.gateScreen(
        'choose',
        w({ ...claimedEmpty, account: null, balance_micros: 2_500_000 }),
      ).body,
    ).toBe(
      `You are signed in to publik. Your balance: $2.50. ${WORDS.connectBody}`,
    )
  })
})

describe('the gate against a fake publik', () => {
  it(
    'sign in: the poll sees the claim, Connect your plan, then the open is counted with the install key',
    async () => {
      // 1: anonymous (press Sign in) 2: anonymous (waiting) 3: the poll sees the claim 4+: claimed with a plan.
      wallets = [anonymous, anonymous, claimedPlan, claimedPlan]
      const h = harness({ [WORDS.connectTitle]: WORDS.connect })
      const gate = await m.ensureSignedIn(h.ui)
      await wait(200)

      expect(h.screens.map((s) => [s.title, s.note])).toEqual([
        [WORDS.title, null],
        [WORDS.title, WORDS.waiting],
        [WORDS.connectTitle, null],
      ])
      expect(h.screens[0]).toEqual({
        title: WORDS.title,
        body: WORDS.signInBody,
        note: null,
        buttons: [WORDS.signInButton],
      })
      expect(h.opened).toEqual([`${origin}/claim/abc`])
      expect(gate.choice).toBe('publik')
      expect(gate.wallet.account?.handle).toBe('mann')
      expect(await m.readCredential()).toMatchObject({
        key: 'pk_live_gatetest',
        base_url: baseUrl,
      })
      expect(await m.accountStorage.getValue()).toMatchObject({
        handle: 'mann',
        plan: { kind: 'plan', label: 'Plus' },
        top_up_url: `${origin}/wallet?top_up=1`,
      })
      expect((await m.resolveProvider(null)).kind).toBe('publik')

      // Usage counting starts after the gate, with the install key, in the wire format of /skills/telemetry.md.
      const events = telemetry()
      expect(events.length).toBe(1)
      expect(events[0]?.auth).toBe('Bearer pk_live_gatetest')
      const first = JSON.parse(events[0]?.body ?? '{}') as Record<
        string,
        unknown
      >
      expect(Object.keys(first).sort()).toEqual(
        ['app', 'app_version', 'arch', 'event', 'install_id', 'os', 'v'].sort(),
      )
      expect(first).toMatchObject({
        v: 1,
        app: 'astro',
        event: 'app_opened',
        app_version: '1.2.3',
        os: 'macos',
        arch: 'arm64',
      })
      expect(String(first.install_id)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      )
      // Every /wallet call carries the key; /installs carries none.
      expect(
        requests
          .filter((r) => r.url === '/api/v1/wallet')
          .every((r) => r.auth === 'Bearer pk_live_gatetest'),
      ).toBe(true)
      expect(
        requests
          .filter((r) => r.url === '/api/v1/installs')
          .every((r) => r.auth === null),
      ).toBe(true)
      expect(JSON.parse(requests[0]?.body ?? '{}')).toMatchObject({
        app_slug: 'astro',
        app_version: '1.2.3',
        app_token: 'pat_astro_gatetest',
        os: 'macos',
      })
    },
    { timeout: 20_000 },
  )

  it('Use my own key is stored, and the next start skips the plan screen', async () => {
    wallets = [claimedEmpty]
    const first = harness({ [WORDS.chooseTitle]: WORDS.ownKey })
    const gate = await m.ensureSignedIn(first.ui)
    expect(first.screens).toEqual([
      {
        title: WORDS.chooseTitle,
        body: `You are signed in as @mann. ${WORDS.chooseBody}`,
        note: null,
        buttons: [WORDS.getPlan, WORDS.ownKey],
      },
    ])
    expect(gate.choice).toBe('own_key')
    expect((await m.resolveProvider(null)).kind).toBe('needs_own_key')
    expect(
      (
        await m.resolveProvider({
          baseURL: 'https://api.openai.com/v1',
          apiKey: 'sk-own',
        })
      ).kind,
    ).toBe('own')

    const second = harness()
    const again = await m.ensureSignedIn(second.ui)
    expect(second.screens).toEqual([])
    expect(again.choice).toBe('own_key')
  })

  it('Get a plan opens the top-up page and waits', async () => {
    wallets = [claimedEmpty]
    const h = harness({ [WORDS.chooseTitle]: WORDS.getPlan })
    await expect(m.ensureSignedIn(h.ui)).rejects.toThrow('gave up')
    expect(h.opened[0]).toBe(`${origin}/wallet?top_up=1`)
    expect(h.screens[1]?.note).toBe(
      'Waiting for your plan. Finish in your browser.',
    )
    expect(telemetry()).toEqual([])
  })

  it('no other way past the sign-in screen while publik says anonymous', async () => {
    const h = harness({ [WORDS.title]: WORDS.signInButton })
    await expect(m.ensureSignedIn(h.ui)).rejects.toThrow('gave up')
    expect(h.screens.length).toBe(7)
    expect(
      h.screens.every((s) => s.title === WORDS.title && s.buttons.length === 1),
    ).toBe(true)
    expect(telemetry()).toEqual([])
    expect(await m.accountStorage.getValue()).toBeNull()
  })

  it('publik not reachable shows Retry and nothing else', async () => {
    globalThis.fetch = (() =>
      Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch
    const h = harness()
    await expect(m.ensureSignedIn(h.ui)).rejects.toThrow('gave up')
    expect(h.screens.length).toBe(7)
    for (const s of h.screens) {
      expect(s).toEqual({
        title: WORDS.title,
        body: WORDS.unreachable,
        note: null,
        buttons: [WORDS.retry],
      })
    }
  })

  it('a bad app token is a readable message with Retry', async () => {
    installsStatus = 401
    const h = harness()
    await expect(m.ensureSignedIn(h.ui)).rejects.toThrow('gave up')
    expect(h.screens[0]).toEqual({
      title: WORDS.title,
      body: 'This app token is not valid.',
      note: null,
      buttons: [WORDS.retry],
    })
  })

  it('a revoked key (401) provisions a new one', async () => {
    wallets = [claimedPlan]
    const first = harness({ [WORDS.connectTitle]: WORDS.connect })
    await m.ensureSignedIn(first.ui)
    expect(requests.filter((r) => r.url === '/api/v1/installs').length).toBe(1)

    requests.length = 0
    walletStatus = 401
    walletOkAfterInstalls = 2 // the module drops the key and provisions again until the wallet answers
    const second = harness()
    const gate = await m.ensureSignedIn(second.ui)
    expect(
      requests.filter((r) => r.url === '/api/v1/installs').length,
    ).toBeGreaterThanOrEqual(2)
    expect(gate.choice).toBe('publik')
    expect(second.screens).toEqual([])
  })
})

describe('the self-test', () => {
  it('prints the ok line only after a real GET /wallet answers', async () => {
    expect(await m.selfTest()).toBe('publik self-test: ok astro 1.2.3')
    expect(requests.map((r) => r.url)).toEqual([
      '/api/v1/installs',
      '/api/v1/wallet',
    ])

    walletStatus = 500
    expect(await m.selfTest()).toBe(
      'publik self-test: failed: This key is not valid.',
    )

    installsStatus = 401
    walletStatus = 200
    storageValues.clear()
    expect(await m.selfTest()).toBe(
      'publik self-test: failed: This app token is not valid.',
    )

    token = undefined
    installsStatus = 201
    storageValues.clear()
    expect(await m.selfTest()).toBe(
      'publik self-test: failed: This build has no publik app token. Ask the developer for a new build.',
    )

    token = 'pat_astro_gatetest'
    globalThis.fetch = (() =>
      Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch
    expect(await m.selfTest()).toBe(
      'publik self-test: failed: publik is not reachable. Check your connection.',
    )
  })
})

describe('usage counting', () => {
  it('sends app_opened once per browser session, then active_session on the alarm', async () => {
    await m.credentialStorage.setValue({
      key: 'pk_live_gatetest',
      base_url: baseUrl,
      install_id: 'x',
      claim_url: null,
    })
    await m.startTelemetry()
    await m.startTelemetry()
    await wait(200)
    expect(telemetry().length).toBe(1)
    expect(JSON.parse(telemetry()[0]?.body ?? '{}')).toMatchObject({
      event: 'app_opened',
    })

    await m.sendEvent('active_session')
    expect(telemetry().length).toBe(2)
    expect(JSON.parse(telemetry()[1]?.body ?? '{}')).toMatchObject({
      event: 'active_session',
    })
    expect(telemetry().every((r) => r.auth === 'Bearer pk_live_gatetest')).toBe(
      true,
    )
    // The install ID is kept.
    const ids = telemetry().map((r) => JSON.parse(r.body).install_id)
    expect(ids[0]).toBe(ids[1])
  })

  it('a 404 from publik is silent, and an opt-out sends nothing', async () => {
    telemetryStatus = 404
    await m.sendEvent('app_opened')
    expect(telemetry().length).toBe(1)

    await m.telemetryConsentStorage.setValue({ usage: false })
    await m.sendEvent('app_opened')
    expect(telemetry().length).toBe(1)
  })

  it('sends no key when the install has none', async () => {
    await m.sendEvent('app_opened')
    expect(telemetry()[0]?.auth).toBeNull()
  })
})

describe('a 402 from the gateway', () => {
  it('is remembered with its one link when the app pays with publik', async () => {
    await m.choiceStorage.setValue('publik')
    await m.accountStorage.setValue({
      handle: 'mann',
      plan: { kind: 'none', label: null },
      balance_micros: 0,
      top_up_url: 'https://publikhq.com/wallet?top_up=1',
      linked_at: null,
      seen_at: 0,
    })
    expect(
      await m.note402('402 Your publik balance is too low for this request.'),
    ).toBe(true)
    expect(await m.moneyStorage.getValue()).toEqual({
      message: 'Your publik balance is too low for this request.',
      url: 'https://publikhq.com/wallet?top_up=1',
    })
    expect(await m.note402('Something else broke')).toBe(false)
    await m.clear402()
    expect(await m.moneyStorage.getValue()).toBeNull()
  })

  it('is ignored when the person uses their own key', async () => {
    await m.choiceStorage.setValue('own_key')
    expect(await m.note402('402 insufficient_credit')).toBe(false)
    expect(await m.moneyStorage.getValue()).toBeNull()
  })

  it('topUpUrlFrom402 reads the body', () => {
    expect(
      m.topUpUrlFrom402({
        error: { message: 'Low.', top_up_url: 'https://publikhq.com/x' },
      }),
    ).toEqual({ message: 'Low.', url: 'https://publikhq.com/x' })
    expect(m.topUpUrlFrom402(null)).toEqual({
      message: 'Not enough publik API balance.',
      url: null,
    })
    expect(m.publikLink('https://evil.example/x')).toBeNull()
    expect(m.publikLink('https://publikhq.com/wallet')).toBe(
      'https://publikhq.com/wallet',
    )
  })
})
