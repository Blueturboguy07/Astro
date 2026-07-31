/**
 * @license
 * Copyright 2025 BrowserOS
 *
 * Build-time inlined environment variables.
 *
 * IMPORTANT: Values here are replaced at build time by Bun's `--env inline` flag.
 * The `process.env.X` access MUST be direct (not via a variable) for inlining to work.
 *
 * These variables are:
 * - Replaced with literal strings in production builds
 * - Read from actual env vars during development
 *
 * Runtime-only feature toggles should be read at their feature boundary.
 */

export const INLINED_ENV = {
  SENTRY_DSN: process.env.SENTRY_DSN,
  POSTHOG_API_KEY: process.env.POSTHOG_API_KEY,
  BROWSEROS_CONFIG_URL: process.env.BROWSEROS_CONFIG_URL,
} as const

/**
 * Telemetry keys are deliberately not required.
 *
 * Upstream fails a production build without SENTRY_DSN and POSTHOG_API_KEY, so
 * anyone building the browser has to supply analytics credentials — and the
 * obvious shortcut, reusing upstream's, silently ships their users' telemetry
 * to someone else's project. Both are optional here: absent, the server logs
 * "Metrics disabled" and reports nothing.
 *
 * BROWSEROS_CONFIG_URL stays required. It resolves the bundled default model,
 * and without it a fresh install has no way to answer anything until the user
 * configures a provider by hand.
 */
export const REQUIRED_FOR_PRODUCTION = [
  'BROWSEROS_CONFIG_URL',
] as const satisfies readonly (keyof typeof INLINED_ENV)[]
