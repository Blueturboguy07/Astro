import { ZodError, z } from 'zod/v3'
import { parseAstroApiUrl } from './browseros-api-url'

export function parseAlphaFeaturesFlag(value: string | undefined): boolean {
  return value === 'true'
}

/* A pat_<slug>_<32> app token, or undefined. Whitespace-only and
   placeholder values count as absent so a half-filled .env never ships a
   build that thinks it can mint. */
export function parsePublikToken(
  value: string | undefined,
): string | undefined {
  const v = value?.trim()
  if (!v) return undefined
  return /^pat_[a-z0-9-]+_[a-z0-9]{16,}$/i.test(v) ? v : undefined
}

export function parsePublikBaseUrl(value: string | undefined): string {
  const v = value?.trim()
  if (!v) return 'https://publikhq.com/api/v1'
  let url: URL
  try {
    url = new URL(v)
  } catch {
    throw new Error(
      'VITE_PUBLIK_API_BASE_URL must be a valid URL including http:// or https://',
    )
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('VITE_PUBLIK_API_BASE_URL must use http:// or https://')
  }
  return v.replace(/\/+$/, '')
}

/* Built on first access rather than at module scope. WXT evaluates every
   entrypoint through vite-node to read its config, and an entrypoint that
   imports `env` used to run z.object() there -- where zod is externalized and
   the build died with "undefined is not an object (evaluating z.object)"
   before writing a single file. */
function buildSchema() {
  return z.object({
    VITE_ALPHA_FEATURES: z
      .string()
      .optional()
      .transform(parseAlphaFeaturesFlag),
    VITE_PUBLIC_POSTHOG_KEY: z.string().optional(),
    VITE_PUBLIC_POSTHOG_HOST: z.string().optional(),
    VITE_PUBLIC_SENTRY_DSN: z.string().optional(),
    VITE_PUBLIC_BROWSEROS_API: z
      .string()
      .optional()
      .transform(parseAstroApiUrl),
    /* publik API (lib/publik): the public app token the packaged build
       carries so a fresh install can mint its own key. Absent in dev and
       source builds, where every publik surface hides itself. */
    VITE_PUBLIK_APP_TOKEN: z.string().optional().transform(parsePublikToken),
    VITE_PUBLIK_API_BASE_URL: z
      .string()
      .optional()
      .transform(parsePublikBaseUrl),
    PROD: z.boolean().optional().default(false),
  })
}

type Env = z.infer<ReturnType<typeof buildSchema>>

let parsed: Env | null = null

function load(): Env {
  if (parsed) return parsed
  try {
    parsed = buildSchema().parse(import.meta.env)
    return parsed
  } catch (error) {
    if (error instanceof ZodError) {
      let message = 'Missing required values in .env:\n'
      for (const issue of error.issues) {
        message += `${issue.path.join('.')}\n`
      }
      const e = new Error(message)
      e.stack = ''
      throw e
    }
    // biome-ignore lint/suspicious/noConsole: allowed to display error information
    console.error(error)
    throw error
  }
}

/**
 * @public
 */
export const env = new Proxy({} as Env, {
  get(_target, prop, receiver) {
    return Reflect.get(load(), prop, receiver)
  },
}) as Env
