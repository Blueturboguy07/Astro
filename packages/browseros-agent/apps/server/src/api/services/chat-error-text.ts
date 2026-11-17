import { APICallError } from 'ai'

/**
 * The text the side panel gets for a failed turn. Without this the AI SDK
 * sends "An error occurred." for everything, so a publik 402 lost its
 * message and its top-up link (Astro 0.2.4 QA, F-021).
 *
 * A provider error whose body carries a `top_up_url` (publik's 402) is
 * passed on as that JSON body, which the panel parses; any other provider
 * error passes on its message.
 */
export function chatErrorText(error: unknown): string {
  if (APICallError.isInstance(error)) {
    const body = parseBody(error.responseBody)
    if (body?.error?.top_up_url) {
      return JSON.stringify({
        error: {
          type: body.error.type ?? 'insufficient_credit',
          message: body.error.message ?? error.message,
          top_up_url: body.error.top_up_url,
        },
      })
    }
    /* publik's daily cap and spent plan budget: keep the type and the
       Retry-After as a reset time so the panel can say when it resets and
       link the wallet (F-050). */
    const type = body?.error?.type
    if (type === 'daily_cap_reached' || type === 'week_budget_reached') {
      const retryAfter = Number(
        error.responseHeaders?.['retry-after'] ??
          error.responseHeaders?.['Retry-After'],
      )
      return JSON.stringify({
        error: {
          type,
          message: body?.error?.message ?? error.message,
          ...(Number.isFinite(retryAfter) && retryAfter > 0
            ? {
                reset_at: new Date(
                  Date.now() + retryAfter * 1000,
                ).toISOString(),
              }
            : {}),
        },
      })
    }
    return error.message || `The AI provider answered ${error.statusCode}.`
  }
  if (error instanceof Error && error.message) return error.message
  return 'An error occurred.'
}

type ErrorBody = {
  error?: { type?: string; message?: string; top_up_url?: string }
}

function parseBody(text: string | undefined): ErrorBody | null {
  if (!text) return null
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? (parsed as ErrorBody) : null
  } catch {
    return null
  }
}
