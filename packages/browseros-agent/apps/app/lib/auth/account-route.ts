import { accountApiConfigured } from '../browseros-api-url'

/* Astro 0.2.4 QA, F-022 / F-032: Astro has no BrowserOS account. Without
   an account API, #/login (BrowserOS Google sign-in) and #/profile go to the
   publik account instead: Settings > Usage shows it (PublikUsage), with
   Switch publik account and Sign out of publik. */

/** True only when a build names a BrowserOS-style account API on purpose. */
export const ACCOUNT_API = accountApiConfigured(
  import.meta.env.VITE_PUBLIC_BROWSEROS_API,
)

/** The page that shows the publik account in an Astro build. */
export const PUBLIK_ACCOUNT_PATH = '/settings/usage'

/** #/logout with this query signs out of publik, then the gate asks to sign in again with a note about the other account. */
export const SWITCH_ACCOUNT_PATH = '/logout?switch=1'
