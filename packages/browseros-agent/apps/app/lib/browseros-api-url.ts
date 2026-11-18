/* Astro has no BrowserOS account: the person signs in with publik. A build
   that names no account API gets a host that never resolves (RFC 6761
   .invalid, like NO_HOSTED_MODEL_URL), so nothing in the bundle names the
   upstream account service (QA F-011: every page open called its
   /api/auth/get-session; F-032: #/login posted to it). */
export const NO_ACCOUNT_API_URL = 'https://account.astro.invalid'

/* Unless a build names an account API on purpose, nothing asks for a
   session, and the login/sync UI is replaced by the publik account. */
export function accountApiConfigured(value: string | undefined): boolean {
  return Boolean(value?.trim())
}

/** Resolves and validates the Astro API base URL for runtime and build config. */
export function parseAstroApiUrl(value: string | undefined): string {
  const rawUrl = value?.trim() || NO_ACCOUNT_API_URL
  let url: URL

  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error(
      'VITE_PUBLIC_BROWSEROS_API must be a valid URL including http:// or https://',
    )
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('VITE_PUBLIC_BROWSEROS_API must use http:// or https://')
  }

  return url.toString().replace(/\/$/, '')
}
