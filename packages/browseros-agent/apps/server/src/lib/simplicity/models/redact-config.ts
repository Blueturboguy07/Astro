const SECRET_FIELD = /key|token|secret|password|auth|credential/i

/**
 * A provider config for a log line: secret fields are replaced. The failed
 * start of a provider logged the whole config, with its API key or the
 * publik pk_ key (Astro 0.2.4 QA, round 5).
 */
export function redactConfig(config: unknown): Record<string, unknown> {
  if (!config || typeof config !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(config)) {
    out[name] = SECRET_FIELD.test(name)
      ? '[redacted]'
      : typeof value === 'string' || typeof value === 'number'
        ? value
        : typeof value
  }
  return out
}
