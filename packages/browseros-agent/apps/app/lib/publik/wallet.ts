import { creditErrorFrom } from './cta'
import {
  agentProvider,
  handleKeyRevoked,
  type ProvisionDeps,
  publikKey,
  walletPatch,
} from './provision'
import { publikEnv, readState, writeState } from './state'
import type { WalletResponse } from './types'

/* The balance line is wallet-driven. The answer engine's metered calls are
   made by the local server, whose OpenAI client the extension cannot see
   headers from, so `GET /wallet` (key auth, CONTRACT §3.2) is the source:
   read on card mount, after every answer, and at most once a minute
   otherwise. The key is read from the agent store and never leaves this
   module. */

export const WALLET_FRESH_MS = 60_000

export async function refreshWallet(
  deps: ProvisionDeps & { force?: boolean } = {},
): Promise<void> {
  const state = await readState()
  if (state?.state !== 'active') return
  if (
    !deps.force &&
    state.walletSeenAt &&
    Date.now() - state.walletSeenAt < WALLET_FRESH_MS
  )
    return

  const key = await publikKey()
  if (!key) return
  const agent = await agentProvider()
  const baseUrl = (agent?.baseUrl ?? publikEnv().baseUrl ?? '').replace(
    /\/+$/,
    '',
  )
  if (!baseUrl) return

  try {
    const res = await (deps.fetch ?? fetch)(`${baseUrl}/wallet`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(deps.timeoutMs ?? 8_000),
    })
    if (res.status === 401) {
      let body: { error?: { type?: string; reprovision?: boolean } } | null =
        null
      try {
        body = await res.json()
      } catch {
        body = null
      }
      if (body?.error?.type === 'key_revoked') {
        await handleKeyRevoked(body.error.reprovision === true, deps)
      }
      return
    }
    if (!res.ok) return
    const wallet = (await res.json()) as WalletResponse
    await writeState(walletPatch(wallet))
  } catch {
    /* Offline: the card keeps the last known balance. */
  }
}

/* The chat relays a provider failure as one string. When it is a gateway
   402, remember it so the card can show the message with its one link
   (CONTRACT §12.3) and refresh the wallet so the balance line agrees. */
export async function noteChatError(
  message: unknown,
  deps: ProvisionDeps = {},
): Promise<boolean> {
  const state = await readState()
  if (state?.state !== 'active') return false
  const credit = creditErrorFrom(message)
  if (!credit) return false
  await writeState({
    creditError: {
      message: credit.message,
      topUpUrl: state.topUpUrl ?? state.claimUrl ?? null,
    },
  })
  await refreshWallet({ ...deps, force: true })
  return true
}
