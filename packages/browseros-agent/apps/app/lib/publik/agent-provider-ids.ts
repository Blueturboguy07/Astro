/* The side-panel provider entries "Connect your plan" writes, one per tier
   (lib/publik/providers.ts). Kept apart so icon code can tell a publik entry
   from a plain OpenAI-compatible one without loading the provider stores. */

export const PUBLIK_AGENT_PROVIDER_ID = 'publik-api'

export const PUBLIK_AGENT_PROVIDER_IDS: readonly string[] = [
  PUBLIK_AGENT_PROVIDER_ID,
  `${PUBLIK_AGENT_PROVIDER_ID}-fast`,
  `${PUBLIK_AGENT_PROVIDER_ID}-smart`,
]

export const isPublikAgentProviderId = (id: string | null | undefined) =>
  !!id && PUBLIK_AGENT_PROVIDER_IDS.includes(id)
