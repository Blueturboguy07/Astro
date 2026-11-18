import { describe, expect, it, mock } from 'bun:test'
import { type ComponentProps, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { LlmProviderConfig } from '@/lib/llm-providers/types'
import * as providerRuntime from '../../lib/llm-providers/provider-runtime'

mock.module('@/lib/utils', () => ({
  cn: (...inputs: Array<string | false | null | undefined>) =>
    inputs.filter(Boolean).join(' '),
}))
mock.module('@/components/ui/button', () => ({
  Button: ({
    children,
    variant: _v,
    size: _s,
    ...props
  }: ComponentProps<'button'> & { variant?: string; size?: string }) =>
    createElement('button', { type: 'button', ...props }, children),
}))
mock.module('@/components/ui/badge', () => ({
  Badge: ({ children }: { children?: unknown }) =>
    createElement('span', null, children as never),
}))
mock.module('@/lib/llm-providers/provider-runtime', () => providerRuntime)
mock.module('@/lib/llm-providers/providerIcons', () => ({
  AstroIcon: () => null,
  ProviderIcon: () => null,
}))

const { ProviderCard } = await import('./ProviderCard')

const provider: LlmProviderConfig = {
  id: 'ollama-local',
  type: 'ollama',
  name: 'Ollama local',
  baseUrl: 'http://127.0.0.1:11434',
  modelId: 'qwen2.5:7b',
  supportsImages: false,
  contextWindow: 32000,
  temperature: 0.2,
  createdAt: 1,
  updatedAt: 1,
}

describe('ProviderCard (own-key settings, Astro 0.2.4 QA)', () => {
  const html = renderToStaticMarkup(
    createElement(ProviderCard, {
      provider,
      isSelected: false,
      isBuiltIn: false,
      onSelect: () => {},
    }),
  )

  it('the delete icon button has an accessible name', () => {
    expect(html).toContain('aria-label="Delete Ollama local"')
  })

  it('the hidden radio stays inside its card (positioned label)', () => {
    expect(html).toMatch(/<label[^>]*class="[^"]*\brelative\b/)
    expect(html).toContain('type="radio"')
  })
})
