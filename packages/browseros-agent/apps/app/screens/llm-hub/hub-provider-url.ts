/* Astro 0.2.4 QA, F-091 (e): "not a url" was saved as "https://not a url".
   The URL parser in the browser is lenient about some hosts, so the host is
   checked here: a dotted name, localhost or an IP address, optional port. */
const HOST =
  /^(localhost|(\d{1,3}\.){3}\d{1,3}|([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63})(:\d{1,5})?$/i

/** The URL to store for a chat provider, or null when it is not a web address. */
export function hubProviderUrl(raw: string): string | null {
  let value = raw.trim()
  if (!value || /\s/.test(value)) return null
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const host = value.replace(/^https?:\/\//i, '').split(/[/?#]/)[0] ?? ''
  if (!HOST.test(host)) return null
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  return value.endsWith('/') ? value.slice(0, -1) : value
}
