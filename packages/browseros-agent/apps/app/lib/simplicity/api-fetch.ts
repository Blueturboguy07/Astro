/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Same-origin `/api/*` shim for the ported Simplicity UI.
 *
 * Upstream ran inside Next, so `fetch('/api/chat')` hit its own server. These
 * pages are served from a chrome-extension:// origin, where that path resolves
 * to the extension itself and 404s. This prefixes the local BrowserOS agent
 * server, which mounts Simplicity's routes under /api.
 *
 * Kept signature-compatible with `fetch` so call sites only change name.
 */

import { getAgentServerUrl } from '@/lib/browseros/helpers'

export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  /* Absolute URLs pass through untouched — some call sites fetch third parties. */
  if (/^https?:\/\//i.test(path)) {
    return fetch(path, init)
  }
  const base = await getAgentServerUrl()
  return fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, init)
}
