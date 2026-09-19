import { storage } from '@wxt-dev/storage'
import { env } from '@/lib/env'
import {
  DISCLOSURE_VERSION,
  PUBLIK_BASE_URL_DEFAULT,
  type PublikState,
  type PublikStatus,
} from './types'

/* publik state lives in extension storage, next to the agent's own
   provider list. It holds state and money only — never the app token
   (compiled in) and never the key (the two provider stores hold that). */
export const publikStateStorage = storage.defineItem<PublikState | null>(
  'local:publik-state',
  { fallback: null },
)

export type PublikEnv = { token?: string; baseUrl?: string }

/* The compiled-in token and base URL. Read lazily so a test (or a build
   step that evaluates this module through vite-node) never touches
   import.meta.env unless something actually provisions. */
export const publikEnv = (): PublikEnv => {
  try {
    return {
      token: env.VITE_PUBLIK_APP_TOKEN,
      baseUrl: env.VITE_PUBLIK_API_BASE_URL || PUBLIK_BASE_URL_DEFAULT,
    }
  } catch {
    return { baseUrl: PUBLIK_BASE_URL_DEFAULT }
  }
}

export const hasAppToken = (e: PublikEnv = publikEnv()) => Boolean(e.token)

export const readState = () => publikStateStorage.getValue()

export async function writeState(
  patch: Partial<PublikState>,
): Promise<PublikState> {
  const current = (await readState()) ?? undefined
  const next = { ...(current ?? {}), ...patch } as PublikState
  /* `undefined` is how a caller clears a field — strip so storage never
     carries a literal null where the type says string. */
  for (const k of Object.keys(next) as (keyof PublikState)[]) {
    if (next[k] === undefined) delete next[k]
  }
  await publikStateStorage.setValue(next)
  return next
}

export const disclosureAccepted = (state: PublikState | null | undefined) =>
  (state?.disclosureVersion ?? 0) >= DISCLOSURE_VERSION

/* What the UI reads. `available` is the build-time token: without it the
   packaged surfaces (card, settings row, banner) do not render at all. */
export function toStatus(
  state: PublikState | null | undefined,
  available: boolean,
): PublikStatus {
  const s = state ?? undefined
  const connected = available && s?.state === 'active'
  return {
    available,
    state: available ? (s?.state ?? 'pending') : 'unavailable',
    connected,
    disclosureCurrent: disclosureAccepted(s),
    claimUrl: s?.claimUrl ?? null,
    addCreditUrl: s?.addCreditUrl ?? null,
    topUpUrl: s?.topUpUrl ?? null,
    claimState: s?.claimState ?? null,
    balanceMicros: s?.balanceMicros ?? null,
    starterRemainingMicros: s?.starterRemainingMicros ?? null,
    starterGrantMicros: s?.starterMicros ?? null,
    creditError: s?.creditError ?? null,
    ctaSeen: Boolean(s?.ctaSeenAt),
    week: {
      usedMicros: s?.weekUsedMicros ?? null,
      budgetMicros: s?.weekBudgetMicros ?? null,
      resetsAt: s?.weekResetsAt ?? null,
    },
    lastError: s?.lastError ?? null,
  }
}
