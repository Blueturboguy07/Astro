/**
 * @license
 * Copyright 2026 publik
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Rebrand the visible "BrowserOS" text compiled into Chromium's `.pak`
 * resource bundles to "Astro".
 *
 * The About box, the app/window menus, the chrome://browseros-onboarding
 * WebUI and the chrome://version fragment are NOT in the framework Mach-O — a
 * same-length byte-patch cannot reach them. They live as entries in the
 * DataPack v5 `.pak` files (`Resources/en.lproj/locale.pak`, every other
 * `<lang>.lproj/locale.pak`, and `Resources/resources.pak`; on Windows,
 * `<version>/Locales/*.pak` and `<version>/resources.pak`). Each entry is
 * raw, gzip, or brotli. This module parses the pak, rewrites "BrowserOS" ->
 * "Astro" inside the decoded TEXT entries only (never images), re-encodes,
 * and rebuilds the index — the entry shrinks, so every following offset is
 * recomputed.
 *
 * `selfTestRebrand` is the gate: it re-parses the rebuilt pak and asserts the
 * entry/alias counts and id order are unchanged, no decoded entry still holds
 * "BrowserOS", and every entry still decodes. The recut aborts loudly if any
 * pak fails, so a corrupt pak can never ship. Verified end-to-end on the real
 * 148/151 bundles: the rebuilt browser launches, renders, and reads
 * "Astro Onboarding" / chrome://version "Astro" where the base read
 * "BrowserOS".
 *
 * Only capitalized product-name "BrowserOS" is touched. Lowercase `browseros`
 * (URL slugs, pref keys), the `chrome.browserOS` API surface, and the
 * `browseros_server` binary name never match, so functional identifiers are
 * left intact.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as zlib from 'node:zlib'

const BRAND_FROM = /BrowserOS/g
const BRAND_TO = 'Astro'

type Entry = { id: number; data: Uint8Array }
type Pak = {
  encoding: number
  head567: [number, number, number]
  n: number
  aliasCount: number
  aliases: { id: number; idx: number }[]
  items: Entry[]
}

export function parsePak(buf: Uint8Array): Pak {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const version = dv.getUint32(0, true)
  if (version !== 5) throw new Error(`not DataPack v5 (got ${version})`)
  const encoding = dv.getUint8(4)
  const n = dv.getUint16(8, true)
  const aliasCount = dv.getUint16(10, true)
  const idxOff = (i: number) => ({
    id: dv.getUint16(12 + i * 6, true),
    off: dv.getUint32(14 + i * 6, true),
  })
  const items: Entry[] = []
  for (let i = 0; i < n; i++) {
    const a = idxOff(i)
    const b = idxOff(i + 1)
    items.push({ id: a.id, data: buf.subarray(a.off, b.off) })
  }
  const aliasStart = 12 + (n + 1) * 6
  const aliases: { id: number; idx: number }[] = []
  for (let i = 0; i < aliasCount; i++) {
    aliases.push({
      id: dv.getUint16(aliasStart + i * 4, true),
      idx: dv.getUint16(aliasStart + i * 4 + 2, true),
    })
  }
  return {
    encoding,
    head567: [buf[5], buf[6], buf[7]],
    n,
    aliasCount,
    aliases,
    items,
  }
}

type Decoded = { kind: 'raw' | 'gzip' | 'brotli'; text: Buffer }

function decode(data: Uint8Array): Decoded | null {
  if (data.length >= 8 && data[0] === 0x1e && data[1] === 0x9b) {
    try {
      return {
        kind: 'brotli',
        text: zlib.brotliDecompressSync(data.subarray(8)),
      }
    } catch {
      return null
    }
  }
  if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) {
    try {
      return { kind: 'gzip', text: zlib.gunzipSync(data) }
    } catch {
      return null
    }
  }
  return { kind: 'raw', text: Buffer.from(data) }
}

function reencode(
  kind: Decoded['kind'],
  text: Buffer,
  orig: Uint8Array,
): Uint8Array {
  if (kind === 'raw') return text
  if (kind === 'gzip') return zlib.gzipSync(text, { level: 9 })
  // brotli: DataPack prefixes an 8-byte header — 2-byte magic (1e 9b) then a
  // 48-bit little-endian decompressed length. Preserve the magic, rewrite the
  // length, replace the compressed body.
  const header = Buffer.from(orig.subarray(0, 8))
  header.writeUIntLE(text.length % 0x1000000000000, 2, 6)
  const body = zlib.brotliCompressSync(text, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
  })
  return Buffer.concat([header, body])
}

/** True only for entries that decode to mostly-printable text (skip images). */
function looksText(buf: Buffer): boolean {
  if (buf.length === 0) return true
  const sample = buf.subarray(0, Math.min(buf.length, 4096))
  let printable = 0
  for (const b of sample) {
    if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127)) printable++
  }
  return printable / sample.length > 0.85
}

function rebrandText(buf: Buffer): { out: Buffer; changed: number } {
  if (!looksText(buf)) return { out: buf, changed: 0 }
  const s = buf.toString('latin1')
  const m = s.match(BRAND_FROM)
  if (!m) return { out: buf, changed: 0 }
  return {
    out: Buffer.from(s.replace(BRAND_FROM, BRAND_TO), 'latin1'),
    changed: m.length,
  }
}

export function rebrandPakBuffer(buf: Uint8Array): {
  out: Uint8Array
  changed: number
} {
  const p = parsePak(buf)
  let changed = 0
  const items: Entry[] = p.items.map((it) => {
    const dec = decode(it.data)
    if (!dec) return it
    const { out, changed: c } = rebrandText(dec.text)
    if (!c) return it
    changed += c
    return { id: it.id, data: reencode(dec.kind, out, it.data) }
  })
  if (changed === 0) return { out: buf, changed: 0 }
  const n = items.length
  const headerLen = 12 + (n + 1) * 6 + p.aliasCount * 4
  const total = headerLen + items.reduce((a, it) => a + it.data.length, 0)
  const out = Buffer.alloc(total)
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength)
  dv.setUint32(0, 5, true)
  dv.setUint8(4, p.encoding)
  out[5] = p.head567[0]
  out[6] = p.head567[1]
  out[7] = p.head567[2]
  dv.setUint16(8, n, true)
  dv.setUint16(10, p.aliasCount, true)
  let off = headerLen
  for (let i = 0; i < n; i++) {
    dv.setUint16(12 + i * 6, items[i].id, true)
    dv.setUint32(14 + i * 6, off, true)
    out.set(items[i].data, off)
    off += items[i].data.length
  }
  dv.setUint16(12 + n * 6, 0, true)
  dv.setUint32(14 + n * 6, off, true)
  const aliasStart = 12 + (n + 1) * 6
  for (let i = 0; i < p.aliasCount; i++) {
    dv.setUint16(aliasStart + i * 4, p.aliases[i].id, true)
    dv.setUint16(aliasStart + i * 4 + 2, p.aliases[i].idx, true)
  }
  return { out, changed }
}

/** Re-parse and assert the rebuilt pak is structurally sound and brand-free. */
export function selfTestRebrand(orig: Uint8Array, next: Uint8Array): string[] {
  const a = parsePak(orig)
  const b = parsePak(next)
  const problems: string[] = []
  if (a.n !== b.n) problems.push(`entry count ${a.n} -> ${b.n}`)
  if (a.aliasCount !== b.aliasCount) {
    problems.push(`alias count ${a.aliasCount} -> ${b.aliasCount}`)
  }
  for (let i = 0; i < a.items.length && i < b.items.length; i++) {
    if (a.items[i].id !== b.items[i].id) {
      problems.push(`id order changed at index ${i}`)
      break
    }
  }
  let residual = 0
  let decodeFail = 0
  for (const it of b.items) {
    const d = decode(it.data)
    if (!d) {
      decodeFail++
      continue
    }
    if (d.text.toString('latin1').includes('BrowserOS')) residual++
  }
  if (residual) problems.push(`${residual} entries still contain "BrowserOS"`)
  if (decodeFail) problems.push(`${decodeFail} entries fail to decode`)
  return problems
}

/** Rebrand one pak file in place, gated by the self-test. Returns count changed. */
export function rebrandPakFile(pakPath: string): number {
  const buf = new Uint8Array(fs.readFileSync(pakPath))
  const { out, changed } = rebrandPakBuffer(buf)
  if (changed === 0) return 0
  const problems = selfTestRebrand(buf, out)
  if (problems.length) {
    throw new Error(
      `pak rebrand self-test FAILED for ${pakPath}: ${problems.join('; ')}`,
    )
  }
  fs.writeFileSync(pakPath, out)
  return changed
}

/** Every .pak that can hold visible product text under a resources dir. */
export function findPaks(resourcesDir: string): string[] {
  const out: string[] = []
  const top = [
    'resources.pak',
    'chrome_100_percent.pak',
    'chrome_200_percent.pak',
  ]
  for (const f of top) {
    const p = path.join(resourcesDir, f)
    if (fs.existsSync(p)) out.push(p)
  }
  // macOS: <Resources>/<lang>.lproj/locale.pak ; Windows: <version>/Locales/*.pak
  for (const entry of fs.readdirSync(resourcesDir)) {
    if (entry.endsWith('.lproj')) {
      const p = path.join(resourcesDir, entry, 'locale.pak')
      if (fs.existsSync(p)) out.push(p)
    }
  }
  const locales = path.join(resourcesDir, 'Locales')
  if (fs.existsSync(locales)) {
    for (const f of fs.readdirSync(locales)) {
      if (f.endsWith('.pak')) out.push(path.join(locales, f))
    }
  }
  return out
}

/** Rebrand every pak under a resources dir. Returns {file: changed}. Fails loud. */
export function rebrandResourcePaks(
  resourcesDir: string,
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const p of findPaks(resourcesDir)) {
    const c = rebrandPakFile(p)
    if (c > 0) result[path.relative(resourcesDir, p)] = c
  }
  return result
}
