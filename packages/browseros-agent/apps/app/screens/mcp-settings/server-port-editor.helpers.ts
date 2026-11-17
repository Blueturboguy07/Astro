export const PROXY_PORT_MIN = 9000
export const PROXY_PORT_MAX = 9999

export type ParseResult =
  | { ok: true; port: number }
  | { ok: false; error: string }

/**
 * Validate a user-entered proxy port. Accepts only whole numbers in the
 * Astro port band (9000–9999); rejects empty, non-numeric, and fractional
 * input rather than letting parseInt silently truncate (e.g. "9000.5").
 */
/** The message under the field: a save error, else why the typed value
    cannot be saved (Astro 0.2.4 QA, F-087: a bad port turned the field red
    and disabled Save with no reason). Nothing while the field is empty. */
export function portFieldError(
  raw: string,
  saveError: string | null,
): string | null {
  if (saveError) return saveError
  if (raw.trim() === '') return null
  const parsed = parseProxyPort(raw)
  return parsed.ok ? null : parsed.error
}

export function parseProxyPort(raw: string): ParseResult {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return { ok: false, error: 'Enter a port number' }
  }
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: 'Enter a valid port number' }
  }
  const port = Number(trimmed)
  if (port < PROXY_PORT_MIN || port > PROXY_PORT_MAX) {
    return {
      ok: false,
      error: `Port must be between ${PROXY_PORT_MIN} and ${PROXY_PORT_MAX}`,
    }
  }
  return { ok: true, port }
}
