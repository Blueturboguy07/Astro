import { describe, expect, it, mock } from 'bun:test'
import type { LlmProviderConfig } from '@/lib/llm-providers/types'

mock.module('@wxt-dev/storage', () => ({
  storage: {
    defineItem: <T>(_key: string, options?: { fallback?: T }) => ({
      getValue: async () => options?.fallback,
      setValue: async () => {},
      watch: () => () => {},
    }),
  },
}))

mock.module('@/lib/env', () => ({ env: {} }))

const {
  agentProviderAfterFastRemoved,
  defaultAfterPublikRemoved,
  withPublikAgentProviders,
} = await import('./agent-provider-list')
const { isPublikAgentProviderId } = await import('./agent-provider-ids')

/* Astro 0.2.4 QA. F-017: the side panel offered one "publik API" entry
   (Balanced only). F-018: after "Use my own key" it fell back to the
   built-in "Astro" placeholder, upstream's hosted model. */

const placeholder: LlmProviderConfig = {
  id: 'browseros',
  type: 'browseros',
  name: 'Astro',
  baseUrl: 'https://api.browseros.com/v1',
  modelId: 'browseros-auto',
  supportsImages: true,
  contextWindow: 200000,
  temperature: 0.2,
  createdAt: 1,
  updatedAt: 1,
}
const ownKey: LlmProviderConfig = {
  ...placeholder,
  id: 'my-anthropic',
  type: 'anthropic',
  name: 'My Anthropic',
  modelId: 'claude-sonnet',
  apiKey: 'sk-test',
}

describe('withPublikAgentProviders', () => {
  it('adds one side-panel entry per publik tier', () => {
    const list = withPublikAgentProviders(
      [placeholder],
      'https://publikhq.com/api/v1',
      'pk_test',
      5,
    )
    expect(list.map((p) => [p.id, p.name, p.modelId])).toEqual([
      ['browseros', 'Astro', 'browseros-auto'],
      ['publik-api', 'publik Balanced', 'publik-balanced'],
      ['publik-api-smart', 'publik Smart', 'publik-smart'],
    ])
    expect(
      list
        .slice(1)
        .every((p) => p.apiKey === 'pk_test' && p.type === 'openai-compatible'),
    ).toBe(true)
  })

  it('turns the old single "publik API" entry into publik Balanced in place', () => {
    const old = {
      ...placeholder,
      id: 'publik-api',
      type: 'openai-compatible' as const,
      name: 'publik API',
      modelId: 'publik-balanced',
      createdAt: 3,
    }
    const list = withPublikAgentProviders([old, ownKey], 'https://x', 'k', 9)
    expect(list.map((p) => p.id)).toEqual([
      'publik-api',
      'my-anthropic',
      'publik-api-smart',
    ])
    expect(list[0]).toMatchObject({ name: 'publik Balanced', createdAt: 3 })
  })

  /* F-034: publik Fast stalls on tool calls, and the agent always sends tools. */
  it('removes a stored publik Fast entry and moves its selection to Balanced', () => {
    const fast = {
      ...placeholder,
      id: 'publik-api-fast',
      type: 'openai-compatible' as const,
      name: 'publik Fast',
      modelId: 'publik-fast',
    }
    const list = withPublikAgentProviders([fast, ownKey], 'https://x', 'k', 9)
    expect(list.map((p) => p.id)).toEqual([
      'my-anthropic',
      'publik-api',
      'publik-api-smart',
    ])
    expect(agentProviderAfterFastRemoved('publik-api-fast')).toBe('publik-api')
    expect(agentProviderAfterFastRemoved('my-anthropic')).toBe(null)
  })
})

describe('defaultAfterPublikRemoved', () => {
  it("picks the person's own connection, never the hosted placeholder", () => {
    expect(defaultAfterPublikRemoved([placeholder, ownKey])).toBe(
      'my-anthropic',
    )
  })

  it('leaves the placeholder id only when nothing else exists (the side panel hides it)', () => {
    expect(defaultAfterPublikRemoved([placeholder])).toBe('browseros')
  })
})

describe('isPublikAgentProviderId', () => {
  it('knows the three tier entries', () => {
    expect(isPublikAgentProviderId('publik-api-fast')).toBe(true)
    expect(isPublikAgentProviderId('publik-api')).toBe(true)
    expect(isPublikAgentProviderId('openai')).toBe(false)
    expect(isPublikAgentProviderId(undefined)).toBe(false)
  })
})
