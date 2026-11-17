import { DEFAULT_PROVIDER_ID } from '../llm-providers/provider-selection'
import type { LlmProviderConfig } from '../llm-providers/types'
import { PUBLIK_AGENT_PROVIDER_IDS } from './agent-provider-ids'
import { MODELS } from './publik'

/* The side panel lists providers, not models, so each tier is its own
   provider entry (Astro 0.2.4 QA, F-017). The Balanced entry keeps the id the
   single "publik API" entry had, so a stored selection still points at it. */
const AGENT_TIERS: { id: string; model: string; name: string }[] = [
  {
    id: PUBLIK_AGENT_PROVIDER_IDS[0],
    model: MODELS.balanced,
    name: 'publik Balanced',
  },
  { id: PUBLIK_AGENT_PROVIDER_IDS[1], model: MODELS.fast, name: 'publik Fast' },
  {
    id: PUBLIK_AGENT_PROVIDER_IDS[2],
    model: MODELS.smart,
    name: 'publik Smart',
  },
]

/** The agent provider list with the three publik tiers added or refreshed in place. */
export function withPublikAgentProviders(
  current: LlmProviderConfig[],
  baseUrl: string,
  apiKey: string,
  now = Date.now(),
): LlmProviderConfig[] {
  const entries = AGENT_TIERS.map((tier): LlmProviderConfig => {
    const existing = current.find((p) => p.id === tier.id)
    return {
      id: tier.id,
      type: 'openai-compatible',
      name: tier.name,
      baseUrl,
      modelId: tier.model,
      apiKey,
      supportsImages: true,
      contextWindow: existing?.contextWindow ?? 200000,
      temperature: existing?.temperature ?? 0.2,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
  })
  const kept = current.map((p) => entries.find((e) => e.id === p.id) ?? p)
  const added = entries.filter((e) => !current.some((p) => p.id === e.id))
  return [...kept, ...added]
}

/**
 * The default after the publik entries are removed: the person's own first
 * connection. The built-in "Astro" placeholder is never chosen: it is
 * upstream's hosted service, which Astro has no account with (F-018).
 */
export function defaultAfterPublikRemoved(
  remaining: LlmProviderConfig[],
): string {
  return (
    remaining.find((p) => p.type !== 'browseros')?.id ?? DEFAULT_PROVIDER_ID
  )
}
