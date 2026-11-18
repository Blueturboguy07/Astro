import { describe, expect, it, mock } from 'bun:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/* F-032: in a build without an account API (every Astro build), #/login
   went to BrowserOS's Google sign-in (redirect_uri on api.browseros.com).
   It now shows the publik account page and never creates the auth client. */

let authClients = 0
mock.module('@/lib/auth/auth-client', () => ({
  getAuthClient: () => {
    authClients++
    return {}
  },
  useSession: () => {
    authClients++
    return { data: null, isPending: false }
  },
}))
mock.module(
  '@/lib/auth/account-route',
  () => import('../../lib/auth/account-route'),
)
mock.module('react-router', () => ({
  Navigate: ({ to }: { to: string }) =>
    createElement('a', { 'data-navigate': to }),
  useNavigate: () => () => {},
}))
const passThrough = ({ children }: { children?: ReactNode }) =>
  createElement('div', null, children)
mock.module('@/components/ui/alert', () => ({
  Alert: passThrough,
  AlertDescription: passThrough,
}))
mock.module('@/components/ui/button', () => ({ Button: passThrough }))
mock.module('@/components/ui/card', () => ({
  Card: passThrough,
  CardContent: passThrough,
  CardDescription: passThrough,
  CardHeader: passThrough,
  CardTitle: passThrough,
}))

const { LoginPage } = await import('./LoginPage')
const { ACCOUNT_API, PUBLIK_ACCOUNT_PATH } = await import(
  '../../lib/auth/account-route'
)

describe('#/login without an account API (F-032)', () => {
  it('this test build names no account API', () => {
    expect(ACCOUNT_API).toBe(false)
  })

  it('goes to the publik account page and creates no auth client', () => {
    const html = renderToStaticMarkup(createElement(LoginPage))
    expect(html).toBe(`<a data-navigate="${PUBLIK_ACCOUNT_PATH}"></a>`)
    expect(PUBLIK_ACCOUNT_PATH).toBe('/settings/usage')
    expect(html).not.toContain('Continue with Google')
    expect(authClients).toBe(0)
  })
})
