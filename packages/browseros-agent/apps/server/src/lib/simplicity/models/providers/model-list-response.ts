/**
 * The JSON of a provider's model-list reply, or an error that says why the
 * provider refused. Gemini and Groq parsed a 400/401 body as a list and
 * showed "undefined is not an object (evaluating 'N.models.forEach')"
 * (Astro 0.2.4 QA, F-040).
 */
export async function modelListJson(
  res: Response,
  provider: string,
): Promise<any> {
  const text = await res.text()
  let data: any = null
  try {
    data = JSON.parse(text)
  } catch {}
  if (!res.ok) {
    const detail =
      data?.error?.message ??
      (typeof data?.error === 'string' ? data.error : undefined) ??
      data?.message ??
      (text.trim().slice(0, 200) || res.statusText)
    throw new Error(
      `${provider} refused the request (HTTP ${res.status}): ${String(detail).replace(/\.\s*$/, '')}. Check the API key.`,
    )
  }
  return data
}
