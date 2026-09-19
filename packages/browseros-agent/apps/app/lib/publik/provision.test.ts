import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'
import type { LlmProviderConfig } from '../llm-providers/types'

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
  },
}))

/* The agent's provider store, on top of the same in-memory storage, so the
   real storage.ts (which drags in the GraphQL sync and browser prefs) stays
   out of the test. */
mock.module('../llm-providers/storage', () => {
  const item = <T>(key: string, fallback: T) => ({
    getValue: async () =>
      (storageValues.has(key) ? storageValues.get(key) : fallback) as T,
    setValue: async (value: T) => {
      storageValues.set(key, value)
    },
    watch: () => () => {},
  })
  const providersStorage = item<LlmProviderConfig[] | null>(
    'local:llm-providers',
    null,
  )
  return {
    DEFAULT_PROVIDER_ID: 'browseros',
    providersStorage,
    defaultProviderIdStorage: item<string>(
      'local:default-provider-id',
      'browseros',
    ),
    loadProviders: async () => (await providersStorage.getValue()) ?? [],
  }
})
/* The same-origin shim resolves the server port from a browser pref that
   does not exist here; every test injects `apiFetch` instead. */
mock.module('@/lib/simplicity/api-fetch', () => ({
  apiFetch: async () => {
    throw new Error('apiFetch must be injected')
  },
}))
mock.module('@/lib/env', () => ({
  env: { VITE_PUBLIK_APP_TOKEN: undefined, VITE_PUBLIK_API_BASE_URL: '' },
}))

type Mod = typeof import('./provision')
type StateMod = typeof import('./state')
type WalletMod = typeof import('./wallet')
let provision: Mod
let stateMod: StateMod
let wallet: WalletMod

beforeAll(async () => {
  provision = await import('./provision')
  stateMod = await import('./state')
  wallet = await import('./wallet')
})

const KEY = 'pk_live_abcdefghijkl_abcdefghijklmnopqrstuvwxyz012345'
const KEY2 = 'pk_live_zyxwvutsrqpo_abcdefghijklmnopqrstuvwxyz012345'
const TOKEN = 'pat_astro_abcdefghijklmnopqrstuvwxyz012345'
const env = { token: TOKEN, baseUrl: 'https://publikhq.com/api/v1' }

const install201 = (key = KEY) => ({
  install_id: 'srv',
  key,
  base_url: 'https://publikhq.com/api/v1',
  claim_code: 'HK7F-2QWD',
  claim_url: 'https://publikhq.com/claim/HK7F-2QWD',
  claim_state: 'anonymous',
  starter_micros: 250_000,
  balance_micros: 250_000,
})

const json = (
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  })

/* A tiny stand-in for the local server's /api/providers routes. */
function fakeServer(opts: { down?: boolean } = {}) {
  const providers: {
    id: string
    name: string
    type: string
    config: Record<string, unknown>
    chatModels: { key: string; name: string }[]
    embeddingModels: { key: string; name: string }[]
  }[] = []
  const calls: string[] = []
  const apiFetch = async (path: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${path}`)
    if (opts.down) throw new TypeError('fetch failed')
    if (path === '/api/providers' && (!init || init.method === undefined))
      return json(200, { providers })
    if (path === '/api/providers' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      const p = {
        id: `srv-${providers.length + 1}`,
        name: body.name,
        type: body.type,
        config: body.config,
        chatModels: [],
        embeddingModels: [],
      }
      providers.push(p)
      return json(200, { provider: p })
    }
    const models = path.match(/^\/api\/providers\/([^/]+)\/models$/)
    if (models && init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      const p = providers.find((x) => x.id === models[1])
      if (!p) return json(500, { message: 'no such provider' })
      p.chatModels.push({ key: body.key, name: body.name })
      return json(200, { message: 'Model added successfully' })
    }
    const one = path.match(/^\/api\/providers\/([^/]+)$/)
    if (one && init?.method === 'DELETE') {
      const i = providers.findIndex((x) => x.id === one[1])
      if (i >= 0) providers.splice(i, 1)
      return json(200, { message: 'ok' })
    }
    return json(404, { message: 'not found' })
  }
  return { providers, calls, apiFetch: apiFetch as unknown as typeof fetch }
}

const fetchMock = (responder: (url: string, init?: RequestInit) => Response) =>
  mock(async (url: string | URL | Request, init?: RequestInit) =>
    responder(String(url), init),
  ) as unknown as typeof fetch

const agentProviders = () =>
  (storageValues.get('local:llm-providers') as LlmProviderConfig[]) ?? []

const deps = (
  server: ReturnType<typeof fakeServer>,
  fetch: typeof globalThis.fetch,
) => ({
  env,
  fetch,
  apiFetch:
    server.apiFetch as unknown as typeof import('@/lib/simplicity/api-fetch').apiFetch,
  installId: () => 'inst-1',
  platform: async () => ({ os: 'macos' as const, arch: 'arm64' }),
  appVersion: () => '0.0.101',
  now: () => new Date('2026-09-19T12:00:00Z'),
})

beforeEach(() => {
  storageValues.clear()
})

describe('ensureProvisioned', () => {
  it('is a no-op without a compiled-in token', async () => {
    const server = fakeServer()
    const fetch = fetchMock(() => json(500, {}))
    const result = await provision.ensureProvisioned({
      ...deps(server, fetch),
      env: { baseUrl: env.baseUrl },
    })
    expect(result).toBe('no-token')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('never mints before the disclosure is accepted [S4]', async () => {
    const server = fakeServer()
    const fetch = fetchMock(() => json(201, install201()))
    expect(await provision.ensureProvisioned(deps(server, fetch))).toBe(
      'consent-required',
    )
    expect(fetch).not.toHaveBeenCalled()
    expect(agentProviders()).toHaveLength(0)
  })

  it('accept → mint → both stores hold the key, state is active', async () => {
    const server = fakeServer()
    const fetch = fetchMock((url, init) => {
      expect(url).toBe('https://publikhq.com/api/v1/installs')
      const body = JSON.parse(String(init?.body))
      expect(body.app_slug).toBe('astro')
      expect(body.os).toBe('macos')
      expect(body.install_id).toBe('inst-1')
      expect(body.disclosure_version).toBe(1)
      expect(init?.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` })
      return json(201, install201())
    })

    const result = await provision.acceptDisclosure(deps(server, fetch))
    expect(result).toBe('active')

    /* Agent store: openai-compatible, publik API, pre-selected because the
       only previous default was the built-in placeholder. */
    const agent = agentProviders().find((p) => p.id === 'publik-api')
    expect(agent).toMatchObject({
      type: 'openai-compatible',
      name: 'publik API',
      baseUrl: 'https://publikhq.com/api/v1',
      modelId: 'publik-balanced',
      apiKey: KEY,
    })
    expect(storageValues.get('local:default-provider-id')).toBe('publik-api')

    /* Answer engine: one `openai` provider at the gateway with the three
       aliases named explicitly. */
    expect(server.providers).toHaveLength(1)
    expect(server.providers[0]).toMatchObject({
      type: 'openai',
      name: 'publik API',
      config: { apiKey: KEY, baseURL: 'https://publikhq.com/api/v1' },
    })
    expect(server.providers[0].chatModels.map((m) => m.key)).toEqual([
      'publik-balanced',
      'publik-fast',
      'publik-smart',
    ])

    const state = await stateMod.readState()
    expect(state).toMatchObject({
      state: 'active',
      installId: 'inst-1',
      serverProviderId: 'srv-1',
      claimUrl: 'https://publikhq.com/claim/HK7F-2QWD',
      claimState: 'anonymous',
      starterMicros: 250_000,
      balanceMicros: 250_000,
    })
    /* The key is never in publik-state. */
    expect(JSON.stringify(state)).not.toContain(KEY)

    const status = stateMod.toStatus(state, true)
    expect(status.connected).toBe(true)
    expect(status.ctaSeen).toBe(false)
  })

  it('honours the response base_url and model names over the defaults', async () => {
    const server = fakeServer()
    const fetch = fetchMock(() =>
      json(201, {
        ...install201(),
        base_url: 'https://api.publikhq.com/v1/',
        models: { balanced: 'publik-default', fast: 'publik-fast' },
      }),
    )
    await provision.acceptDisclosure(deps(server, fetch))
    expect(agentProviders()[0]).toMatchObject({
      baseUrl: 'https://api.publikhq.com/v1',
      modelId: 'publik-default',
    })
    expect(server.providers[0].chatModels.map((m) => m.key)).toEqual([
      'publik-default',
      'publik-fast',
      'publik-smart',
    ])
  })

  it('leaves a user-picked agent default alone', async () => {
    storageValues.set('local:default-provider-id', 'my-anthropic')
    storageValues.set('local:llm-providers', [
      {
        id: 'my-anthropic',
        type: 'anthropic',
        name: 'Mine',
        modelId: 'claude-sonnet-5',
        supportsImages: true,
        contextWindow: 200000,
        temperature: 0.2,
        createdAt: 1,
        updatedAt: 1,
      },
    ])
    const server = fakeServer()
    await provision.acceptDisclosure(
      deps(
        server,
        fetchMock(() => json(201, install201())),
      ),
    )
    expect(storageValues.get('local:default-provider-id')).toBe('my-anthropic')
    expect(agentProviders().map((p) => p.id)).toEqual([
      'my-anthropic',
      'publik-api',
    ])
  })

  it('keeps the key when the local server is still starting, and registers later', async () => {
    const down = fakeServer({ down: true })
    const fetch = fetchMock(() => json(201, install201()))
    expect(await provision.acceptDisclosure(deps(down, fetch))).toBe('active')
    expect(agentProviders()[0]?.apiKey).toBe(KEY)
    expect((await stateMod.readState())?.serverProviderId).toBeUndefined()

    const up = fakeServer()
    const id = await provision.ensureAnswerEngineProvider(deps(up, fetch))
    expect(id).toBe('srv-1')
    expect(up.providers[0].chatModels).toHaveLength(3)
    expect((await stateMod.readState())?.serverProviderId).toBe('srv-1')
    /* Idempotent: a second pass adds nothing. */
    await provision.ensureAnswerEngineProvider(deps(up, fetch))
    expect(up.providers).toHaveLength(1)
    expect(up.providers[0].chatModels).toHaveLength(3)
  })

  it('does not add a second connection when the server stops listing ours', async () => {
    /* GET /providers drops any connection whose model list failed to load
       (registry.getActiveProviders filters key === 'error'), so "not in
       the list" cannot mean "create another one" — the card mounts often. */
    const server = fakeServer()
    const fetch = fetchMock(() => json(201, install201()))
    await provision.acceptDisclosure(deps(server, fetch))
    expect(server.providers).toHaveLength(1)
    expect((await stateMod.readState())?.serverProviderId).toBe('srv-1')

    server.providers.length = 0
    const id = await provision.ensureAnswerEngineProvider(deps(server, fetch))
    expect(id).toBe('srv-1')
    expect(server.providers).toHaveLength(0)
    expect(
      server.calls.filter((c) => c === 'POST /api/providers'),
    ).toHaveLength(1)
  })

  it('never overwrites an active connection', async () => {
    const server = fakeServer()
    const fetch = fetchMock(() => json(201, install201()))
    await provision.acceptDisclosure(deps(server, fetch))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(await provision.ensureProvisioned(deps(server, fetch))).toBe(
      'active',
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('replays a known install_id once with a fresh id [B1]', async () => {
    const server = fakeServer()
    let n = 0
    const ids: string[] = []
    const fetch = fetchMock((_url, init) => {
      ids.push(JSON.parse(String(init?.body)).install_id)
      n += 1
      return n === 1
        ? json(200, { key: null, starter_micros: 0, claim_state: 'anonymous' })
        : json(201, install201())
    })
    let k = 0
    const result = await provision.acceptDisclosure({
      ...deps(server, fetch),
      installId: () => `inst-${++k}`,
    })
    expect(result).toBe('active')
    expect(ids).toEqual(['inst-1', 'inst-2'])
  })

  it('rejected token → pending with a reason, nothing stored', async () => {
    const server = fakeServer()
    const fetch = fetchMock(() =>
      json(401, { error: { type: 'invalid_app_token' } }),
    )
    expect(await provision.acceptDisclosure(deps(server, fetch))).toBe('failed')
    expect(await stateMod.readState()).toMatchObject({
      state: 'pending',
      lastError: 'app token rejected',
    })
    expect(agentProviders()).toHaveLength(0)
  })

  it('429 → pending with retry-after', async () => {
    const server = fakeServer()
    const fetch = fetchMock(() =>
      json(
        429,
        { error: { type: 'rate_limit_exceeded' } },
        { 'retry-after': '3600' },
      ),
    )
    await provision.acceptDisclosure(deps(server, fetch))
    expect(await stateMod.readState()).toMatchObject({
      state: 'pending',
      lastError: 'too many installs right now',
      retryAfter: '3600',
    })
  })

  it('a malformed key never lands anywhere', async () => {
    const server = fakeServer()
    const fetch = fetchMock(() => json(201, install201('sk-not-a-publik-key')))
    expect(await provision.acceptDisclosure(deps(server, fetch))).toBe('failed')
    expect(agentProviders()).toHaveLength(0)
    expect(server.providers).toHaveLength(0)
    const state = await stateMod.readState()
    expect(state?.state).toBe('pending')
    expect(JSON.stringify(state)).not.toContain('sk-not')
  })

  it('offline → pending; retry mints with the same install id', async () => {
    const server = fakeServer()
    let calls = 0
    const fetch = fetchMock(() => {
      calls += 1
      if (calls === 1) throw new TypeError('fetch failed')
      return json(201, install201())
    })
    expect(await provision.acceptDisclosure(deps(server, fetch))).toBe('failed')
    expect((await stateMod.readState())?.lastError).toBe('fetch failed')
    expect(await provision.retryPublik(deps(server, fetch))).toBe('active')
    expect((await stateMod.readState())?.installId).toBe('inst-1')
  })
})

describe('decline / reconnect / revoked', () => {
  const connect = async () => {
    const server = fakeServer()
    const fetch = fetchMock(() => json(201, install201()))
    await provision.acceptDisclosure(deps(server, fetch))
    return { server, fetch }
  }

  it('decline removes both entries and pins the choice', async () => {
    const { server, fetch } = await connect()
    await provision.declinePublik(deps(server, fetch))
    expect(agentProviders()).toHaveLength(0)
    expect(server.providers).toHaveLength(0)
    expect(storageValues.get('local:default-provider-id')).toBe('browseros')
    expect((await stateMod.readState())?.state).toBe('declined')
    expect(await provision.ensureProvisioned(deps(server, fetch))).toBe(
      'declined',
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('reconnect asks for consent again with a new install id', async () => {
    const { server, fetch } = await connect()
    await provision.declinePublik(deps(server, fetch))
    await provision.resetPublik({
      ...deps(server, fetch),
      installId: () => 'inst-9',
    })
    const state = await stateMod.readState()
    expect(state).toMatchObject({ state: 'pending', installId: 'inst-9' })
    expect(state?.disclosureVersion).toBeUndefined()
    expect(state?.claimUrl).toBeUndefined()
    expect(await provision.ensureProvisioned(deps(server, fetch))).toBe(
      'consent-required',
    )
  })

  it('key_revoked reprovision:true mints again silently', async () => {
    const { server } = await connect()
    const fetch = fetchMock(() => json(201, install201(KEY2)))
    expect(await provision.handleKeyRevoked(true, deps(server, fetch))).toBe(
      'active',
    )
    expect(agentProviders()[0]?.apiKey).toBe(KEY2)
    expect(server.providers).toHaveLength(1)
    expect(server.providers[0].config.apiKey).toBe(KEY2)
  })

  it('key_revoked reprovision:false disconnects and stops', async () => {
    const { server } = await connect()
    const fetch = fetchMock(() => json(201, install201(KEY2)))
    expect(await provision.handleKeyRevoked(false, deps(server, fetch))).toBe(
      'disconnected',
    )
    expect(fetch).not.toHaveBeenCalled()
    expect(agentProviders()).toHaveLength(0)
    expect(await provision.ensureProvisioned(deps(server, fetch))).toBe(
      'disconnected',
    )
  })

  it('acknowledgeCta records the card was shown and nothing else', async () => {
    const { server, fetch } = await connect()
    await provision.acknowledgeCta(deps(server, fetch))
    const state = await stateMod.readState()
    expect(state?.ctaSeenAt).toBe('2026-09-19T12:00:00.000Z')
    expect(state?.state).toBe('active')
    expect(agentProviders()[0]?.apiKey).toBe(KEY)
  })
})

describe('wallet', () => {
  it('refreshWallet updates the balance line from GET /wallet', async () => {
    const server = fakeServer()
    await provision.acceptDisclosure(
      deps(
        server,
        fetchMock(() => json(201, install201())),
      ),
    )
    const fetch = fetchMock((url, init) => {
      expect(url).toBe('https://publikhq.com/api/v1/wallet')
      expect(init?.headers).toMatchObject({ Authorization: `Bearer ${KEY}` })
      return json(200, {
        balance_micros: 180_000,
        claim_state: 'anonymous',
        starter: { remaining_micros: 180_000 },
        week: { used_micros: 70_000, budget_micros: null, resets_at: 'r' },
        claim_url: 'https://publikhq.com/claim/HK7F-2QWD',
      })
    })
    await wallet.refreshWallet({ ...deps(server, fetch), force: true })
    const status = stateMod.toStatus(await stateMod.readState(), true)
    expect(status.balanceMicros).toBe(180_000)
    expect(status.starterRemainingMicros).toBe(180_000)
    expect(status.week.usedMicros).toBe(70_000)
    /* Throttled: a second call inside a minute does not hit the network. */
    await wallet.refreshWallet(deps(server, fetch))
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('a 401 key_revoked from /wallet disconnects', async () => {
    const server = fakeServer()
    await provision.acceptDisclosure(
      deps(
        server,
        fetchMock(() => json(201, install201())),
      ),
    )
    const fetch = fetchMock(() =>
      json(401, { error: { type: 'key_revoked', reprovision: false } }),
    )
    await wallet.refreshWallet({ ...deps(server, fetch), force: true })
    expect((await stateMod.readState())?.state).toBe('disconnected')
    expect(agentProviders()).toHaveLength(0)
  })

  it('noteChatError keeps a 402 with its one link and ignores the rest', async () => {
    const server = fakeServer()
    await provision.acceptDisclosure(
      deps(
        server,
        fetchMock(() => json(201, install201())),
      ),
    )
    const fetch = fetchMock(() =>
      json(200, { balance_micros: 0, claim_state: 'anonymous', starter: null }),
    )
    expect(
      await wallet.noteChatError(
        'That model failed to answer.',
        deps(server, fetch),
      ),
    ).toBe(false)
    expect(
      await wallet.noteChatError(
        '402 Not enough publik credit for this request. Link this computer and pick a plan at the link below.',
        deps(server, fetch),
      ),
    ).toBe(true)
    const status = stateMod.toStatus(await stateMod.readState(), true)
    expect(status.creditError).toEqual({
      message:
        'Not enough publik credit for this request. Link this computer and pick a plan at the link below.',
      topUpUrl: 'https://publikhq.com/claim/HK7F-2QWD',
    })
    expect(status.balanceMicros).toBe(0)
  })
})
