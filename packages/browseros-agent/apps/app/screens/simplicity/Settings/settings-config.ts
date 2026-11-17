/**
 * The /api/config answer, or an error. A failed load (500, or a body with
 * no fields/values) left the dialog reading config.fields[...] of an error
 * body, which blanked the whole app (Astro 0.2.4 QA, F-030).
 */
export function readConfigResponse<T extends { fields: unknown; values: unknown }>(
  ok: boolean,
  status: number,
  data: unknown,
): T {
  const body = data as Partial<T> & { message?: string }
  if (!ok || !body?.fields || !body?.values) {
    throw new Error(body?.message || `HTTP ${status}`)
  }
  return body as T
}
