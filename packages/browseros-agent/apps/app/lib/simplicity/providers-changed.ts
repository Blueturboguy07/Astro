/**
 * After a connection was added, changed or removed, the open home page kept
 * "No AI connection yet" until Retry (Astro 0.2.4 QA). Every provider write
 * goes through apiFetch, which tells the open pages: this page by a window
 * event, other app pages by a localStorage bump (a 'storage' event there).
 */
export const PROVIDERS_CHANGED_EVENT = 'astro:providers-changed'
export const PROVIDERS_CHANGED_KEY = 'astro.providersChangedAt'

export function isProviderWrite(path: string, method?: string): boolean {
  const m = (method ?? 'GET').toUpperCase()
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false
  return /^\/?api\/providers(\/|$|\?)/.test(path)
}

export function announceProvidersChanged(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(PROVIDERS_CHANGED_KEY, String(Date.now()))
  } catch {}
  window.dispatchEvent(new Event(PROVIDERS_CHANGED_EVENT))
}
