/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * PDF text for read/grep on a tab in Chrome's PDF viewer (Astro 0.2.4 QA,
 * F-070, UC-24). The server fetches the tab's URL and uses the pdfjs path of
 * uploads (F-042), so the compiled binary needs no extra native code.
 */

import { fileURLToPath } from 'node:url'
import { setPdfTextExtractor } from '@browseros/browser-mcp/tools/pdf-tab-text'
import { TOOL_LIMITS } from '@browseros/shared/constants/limits'
import { extractPdfText } from '../lib/simplicity/uploads/pdf-text'

const FETCH_TIMEOUT_MS = 30_000
const CACHE_ENTRIES = 4
const MAX_MB = Math.round(TOOL_LIMITS.PDF_TAB_MAX_BYTES / (1024 * 1024))

/* read then grep on the same PDF should not download it twice. */
const cache = new Map<string, string>()

export async function fetchPdfTabText(
  url: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const cached = cache.get(url)
  if (cached !== undefined) return cached
  const bytes = await pdfBytes(url, signal, fetchImpl)
  if (!startsWithPdfMagic(bytes)) {
    throw new Error(
      'the address did not return a PDF file (the PDF may need a sign-in)',
    )
  }
  const text = await extractPdfText(bytes)
  cache.set(url, text)
  if (cache.size > CACHE_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  return text
}

async function pdfBytes(
  url: string,
  signal: AbortSignal | undefined,
  fetchImpl: typeof fetch,
): Promise<Uint8Array> {
  const parsed = new URL(url)
  if (parsed.protocol === 'file:') {
    const file = Bun.file(fileURLToPath(parsed))
    if (file.size > TOOL_LIMITS.PDF_TAB_MAX_BYTES) throw tooLarge()
    return file.bytes()
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`cannot fetch a ${parsed.protocol} address`)
  }
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS)
  const response = await fetchImpl(url, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    redirect: 'follow',
  })
  if (!response.ok) {
    throw new Error(`the site answered HTTP ${response.status}`)
  }
  const declared = Number(response.headers.get('content-length'))
  if (declared > TOOL_LIMITS.PDF_TAB_MAX_BYTES) throw tooLarge()
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > TOOL_LIMITS.PDF_TAB_MAX_BYTES) throw tooLarge()
  return bytes
}

function tooLarge(): Error {
  return new Error(`the PDF is larger than ${MAX_MB} MB`)
}

/* "%PDF-" may follow a few bytes of junk; pdfjs accepts it in the first KB. */
function startsWithPdfMagic(bytes: Uint8Array): boolean {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024))
  return head.includes('%PDF-')
}

export function registerPdfTabText(): void {
  setPdfTextExtractor((url, signal) => fetchPdfTabText(url, signal))
}

export function clearPdfTabTextCache(): void {
  cache.clear()
}
