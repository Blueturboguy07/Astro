import type { FC, PropsWithChildren } from 'react'
import { useEffect } from 'react'
import { identify, resetIdentity } from '@/lib/analytics/identify'
import { accountApiConfigured } from '../browseros-api-url'
import { useSession } from './auth-client'
import { useSessionInfo } from './sessionStorage'

const ACCOUNT_API = accountApiConfigured(
  import.meta.env.VITE_PUBLIC_BROWSEROS_API,
)

const SessionSync: FC = () => {
  const { data, isPending } = useSession()
  const { updateSessionInfo } = useSessionInfo()

  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-run when data changes
  useEffect(() => {
    if (!isPending) {
      updateSessionInfo({
        session: data?.session,
        user: data?.user,
      })

      if (data?.user?.id) {
        identify({
          id: data.user.id,
          email: data.user.email,
          name: data.user.name || undefined,
        })
      } else {
        resetIdentity()
      }
    }
  }, [data, isPending])

  return null
}

export const AuthProvider: FC<PropsWithChildren> = ({ children }) => (
  <>
    {ACCOUNT_API && <SessionSync />}
    {children}
  </>
)
