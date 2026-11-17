/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Ported from Simplicity (~/Vane src/lib/actions.ts), MIT (c) ItzCrazyKns.
 *
 * The upstream fetched a same-origin `/api/suggestions`, which a Next app gets
 * for free. An extension page has no same-origin API, so the path is resolved
 * against the local BrowserOS agent server instead.
 */

import { getAgentServerUrl } from '@/lib/browseros/helpers'

export async function getSuggestions(chatHistory: [string, string][]) {
  const chatModel = localStorage.getItem('chatModelKey')
  const chatModelProvider = localStorage.getItem('chatModelProviderId')
  const base = await getAgentServerUrl()

  const res = await fetch(`${base}/api/suggestions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chatHistory,
      chatModel: { providerId: chatModelProvider, key: chatModel },
    }),
  })

  const data = (await res.json()) as { suggestions: string[] }
  return data.suggestions
}

export type ApproxLocation = {
  latitude: number
  longitude: number
  city: string
}

let approxLocation: Promise<ApproxLocation | null> | null = null

/**
 * The IP-based location, asked once per page load. The weather widget asked
 * on every render and every 30 s, the service answered 429 with an HTML
 * page, and parsing it threw "Unexpected token '<'" (Astro 0.2.4 QA, F-058).
 * Any failure gives null: the widget then shows no weather.
 */
export function getApproxLocation(
  fetchImpl: typeof fetch = fetch,
): Promise<ApproxLocation | null> {
  approxLocation ??= (async () => {
    try {
      const res = await fetchImpl('https://free.freeipapi.com/api/json')
      if (!res.ok) return null
      const data = (await res.json()) as {
        latitude?: number
        longitude?: number
        cityName?: string
      }
      if (
        typeof data.latitude !== 'number' ||
        typeof data.longitude !== 'number'
      ) {
        return null
      }
      return {
        latitude: data.latitude,
        longitude: data.longitude,
        city: data.cityName ?? '',
      }
    } catch {
      return null
    }
  })()
  return approxLocation
}

export function resetApproxLocationForTesting(): void {
  approxLocation = null
}
