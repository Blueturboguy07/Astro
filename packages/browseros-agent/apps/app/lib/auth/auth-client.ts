import { createAuthClient } from 'better-auth/react'
import { env } from '../env'

type AuthClient = ReturnType<typeof createAuthClient>

let client: AuthClient | null = null
let created = 0

/* Created on first use, not when a page imports this file: Astro has no
   BrowserOS account, and an app page still sent one
   api.browseros.com/api/auth/get-session (Astro 0.2.4 QA, F-011). Only the
   login page and the gated SessionSync (AuthProvider) use it. */
export function getAuthClient(): AuthClient {
  if (!client) {
    client = createAuthClient({ baseURL: env.VITE_PUBLIC_BROWSEROS_API })
    created++
  }
  return client
}

/** How many clients exist (0 until something uses one); for tests. */
export function authClientsCreated(): number {
  return created
}

export const useSession: AuthClient['useSession'] = () =>
  getAuthClient().useSession()
