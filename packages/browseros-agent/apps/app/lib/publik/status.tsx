import { useCallback, useEffect, useRef, useState } from 'react'
import {
  acceptDisclosure,
  acknowledgeCta,
  declinePublik,
  ensureAnswerEngineProvider,
  resetPublik,
  retryPublik,
} from './provision'
import { hasAppToken, publikStateStorage, toStatus } from './state'
import type { PublikStatus } from './types'
import { refreshWallet } from './wallet'

export type PublikAction =
  | 'accept'
  | 'later'
  | 'decline'
  | 'retry'
  | 'reconnect'
  | 'refresh'

export type UsePublikStatus = {
  status: PublikStatus
  busy: boolean
  act: (action: PublikAction) => Promise<PublikStatus>
}

/* One hook for every publik surface: the first-run card, the Settings row
   and the credit banner. State comes from extension storage and is watched,
   so a mint in one tab updates the card in another. */
export function usePublikStatus(): UsePublikStatus {
  const available = hasAppToken()
  const [status, setStatus] = useState<PublikStatus>(() =>
    toStatus(null, available),
  )
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    if (!available) return
    let cancelled = false
    const load = async () => {
      const state = await publikStateStorage.getValue()
      if (!cancelled) setStatus(toStatus(state, true))
      if (state?.state === 'active') {
        /* A server that was still starting at mint time gets the provider
           now; the wallet read is throttled inside. */
        await ensureAnswerEngineProvider()
        await refreshWallet()
      }
    }
    load().catch(() => null)
    const unwatch = publikStateStorage.watch((state) => {
      if (!cancelled) setStatus(toStatus(state, true))
    })
    return () => {
      cancelled = true
      mounted.current = false
      unwatch()
    }
  }, [available])

  const act = useCallback(
    async (action: PublikAction): Promise<PublikStatus> => {
      setBusy(true)
      try {
        switch (action) {
          case 'accept':
            await acceptDisclosure()
            await refreshWallet({ force: true })
            break
          case 'later':
            await acknowledgeCta()
            break
          case 'decline':
            await declinePublik()
            break
          case 'retry':
            await retryPublik()
            break
          case 'reconnect':
            await resetPublik()
            break
          case 'refresh':
            await ensureAnswerEngineProvider()
            await refreshWallet({ force: true })
            break
        }
      } finally {
        if (mounted.current) setBusy(false)
      }
      const next = toStatus(await publikStateStorage.getValue(), available)
      if (mounted.current) setStatus(next)
      return next
    },
    [available],
  )

  return { status, busy, act }
}
