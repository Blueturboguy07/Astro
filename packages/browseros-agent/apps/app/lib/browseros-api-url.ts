export const DEFAULT_BROWSEROS_API_URL = 'https://api.browseros.com'

/* Astro has no BrowserOS account: the person signs in with publik. Unless a
   build names an account API on purpose, nothing asks api.browseros.com for a
   session (QA F-011: every page open called /api/auth/get-session there). */
export function accountApiConfigured(value: string | undefined): boolean {
  return Boolean(value?.trim())
}

/** Resolves and validates the Astro API base URL for runtime and build config. */
export function parseAstroApiUrl(value: string | undefined): string {
  const rawUrl = value?.trim() || DEFAULT_BROWSEROS_API_URL
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
