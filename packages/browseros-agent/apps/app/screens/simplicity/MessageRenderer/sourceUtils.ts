/**
 * Shared helpers for turning a Chunk's metadata into the favicon/domain
 * labels used by citation chips, hover cards, and the Links tab.
 */

export const isFileSource = (url?: string): boolean =>
  !!url && url.startsWith('file_id://')

/** Hostname without the "www." prefix, or '' when it can't be parsed. */
export const getHost = (url?: string): string => {
  if (!url || isFileSource(url)) return ''
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export const faviconUrl = (host: string): string =>
  `https://s2.googleusercontent.com/s2/favicons?domain=${host}&sz=32`

/** Human label for a source: the bare domain, or 'Uploaded File' for uploads. */
export const getDomainLabel = (url?: string): string => {
  if (isFileSource(url)) return 'Uploaded File'
  return getHost(url) || 'source'
}
