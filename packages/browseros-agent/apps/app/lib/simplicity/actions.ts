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

export async function getApproxLocation() {
  const res = await fetch('https://free.freeipapi.com/api/json')
  const data = (await res.json()) as {
    latitude: number
    longitude: number
    cityName: string
  }
  return {
    latitude: data.latitude,
    longitude: data.longitude,
    city: data.cityName,
  }
}
