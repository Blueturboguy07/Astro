import { useQueryClient } from '@tanstack/react-query'
import { clear } from 'idb-keyval'
import { Loader2 } from 'lucide-react'
import type { FC } from 'react'
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { resetIdentity } from '@/lib/analytics/identify'
import { ACCOUNT_API } from '@/lib/auth/account-route'
import { getAuthClient } from '@/lib/auth/auth-client'
import { providersStorage } from '@/lib/llm-providers/storage'
import { signOutOfPublik } from '@/lib/publik/useGate'
import { scheduledJobStorage } from '@/lib/schedules/scheduleStorage'

/* Astro has no upstream account: "Sign out" is a publik sign-out (F-086).
   Upstream's logout wiped the provider list, so the fallback became the
   upstream api.browseros.com model; the person stayed signed in to publik.
   #/logout?switch=1 is "Switch publik account" (F-022): the same sign-out,
   then the gate says how to sign in with another account. */
const PublikLogout: FC = () => {
  const navigate = useNavigate()
  const switching =
    new URLSearchParams(useLocation().search).get('switch') === '1'
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once
  useEffect(() => {
    void (async () => {
      await signOutOfPublik(switching)
      /* The gate covers every page until the person signs in again. */
      navigate('/home', { replace: true })
    })()
  }, [])
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
        <CardTitle className="text-2xl">
          {switching ? 'Switching publik account' : 'Signing out of publik'}
        </CardTitle>
        <CardDescription>
          Your own API keys and scheduled tasks stay on this computer.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

export const LogoutPage: FC = () =>
  ACCOUNT_API ? <AccountLogout /> : <PublikLogout />

const AccountLogout: FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // biome-ignore lint/correctness/useExhaustiveDependencies: must run only once to ensure the logout process happens successfully
  useEffect(() => {
    const performLogout = async () => {
      await providersStorage.removeValue()
      await scheduledJobStorage.removeValue()
      queryClient.clear()
      await clear()

      resetIdentity()
      await getAuthClient().signOut()
      navigate('/home', { replace: true })
    }

    performLogout()
  }, [])

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
        <CardTitle className="text-2xl">Logging out</CardTitle>
        <CardDescription>
          Clearing your session and synced data...
        </CardDescription>
      </CardHeader>
    </Card>
  )
}
