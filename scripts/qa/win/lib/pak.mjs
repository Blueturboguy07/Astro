// DataPack v5 (.pak) read/rebuild, enough to undo one recut defect for a
// diagnostic: the rebrand renamed $i18n{...BrowserOS...} template keys.
import zlib from 'node:zlib'

export function parsePak(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (dv.getUint32(0, true) !== 5) throw new Error(`pak version ${dv.getUint32(0, true)} (want 5)`)
  const n = dv.getUint16(8, true)
  const aliasCount = dv.getUint16(10, true)
  const items = []
  for (let i = 0; i < n; i++) {
    const off = dv.getUint32(14 + i * 6, true)
    const next = dv.getUint32(14 + (i + 1) * 6, true)
    items.push({ id: dv.getUint16(12 + i * 6, true), data: buf.subarray(off, next) })
  }
  const aliasStart = 12 + (n + 1) * 6
  const aliases = []
  for (let i = 0; i < aliasCount; i++) aliases.push({ id: dv.getUint16(aliasStart + i * 4, true), idx: dv.getUint16(aliasStart + i * 4 + 2, true) })
  return { head: buf.subarray(0, 8), items, aliases }
}

function decode(d) {
  try {
    if (d.length >= 8 && d[0] === 0x1e && d[1] === 0x9b) return { kind: 'brotli', text: zlib.brotliDecompressSync(d.subarray(8)) }
    if (d.length >= 2 && d[0] === 0x1f && d[1] === 0x8b) return { kind: 'gzip', text: zlib.gunzipSync(d) }
  } catch {
    return null
  }
  return { kind: 'raw', text: Buffer.from(d) }
}

function encode(kind, text, orig) {
  if (kind === 'raw') return text
  if (kind === 'gzip') return zlib.gzipSync(text, { level: 9 })
  const header = Buffer.from(orig.subarray(0, 8))
  header.writeUIntLE(text.length, 2, 6)
  return Buffer.concat([header, zlib.brotliCompressSync(text)])
}

export function buildPak(p) {
  const n = p.items.length
  const headerLen = 12 + (n + 1) * 6 + p.aliases.length * 4
  const out = Buffer.alloc(headerLen + p.items.reduce((a, it) => a + it.data.length, 0))
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength)
  out.set(p.head, 0)
  dv.setUint16(8, n, true)
  dv.setUint16(10, p.aliases.length, true)
  let off = headerLen
  for (let i = 0; i < n; i++) {
    dv.setUint16(12 + i * 6, p.items[i].id, true)
    dv.setUint32(14 + i * 6, off, true)
    out.set(p.items[i].data, off)
    off += p.items[i].data.length
  }
  dv.setUint16(12 + n * 6, 0, true)
  dv.setUint32(14 + n * 6, off, true)
  const aliasStart = 12 + (n + 1) * 6
  p.aliases.forEach((a, i) => {
    dv.setUint16(aliasStart + i * 4, a.id, true)
    dv.setUint16(aliasStart + i * 4 + 2, a.idx, true)
  })
  return out
}

const KEY_RE = /\$i18n(Polymer|Raw)?\{([^}]*Astro[^}]*)\}/g

/** Template keys with "Astro" in their name, per entry (what the rebrand renamed). */
export function findRenamedKeys(buf) {
  const found = []
  for (const it of parsePak(buf).items) {
    const d = decode(it.data)
    if (!d) continue
    const keys = [...d.text.toString('latin1').matchAll(KEY_RE)].map((m) => m[0])
    if (keys.length) found.push({ id: it.id, kind: d.kind, keys: [...new Set(keys)] })
  }
  return found
}

/** Put "BrowserOS" back into those keys only (prose stays "Astro"). */
export function restoreRenamedKeys(buf) {
  const p = parsePak(buf)
  const changed = []
  p.items = p.items.map((it) => {
    const d = decode(it.data)
    if (!d) return it
    const s = d.text.toString('latin1')
    if (!KEY_RE.test(s)) return it
    KEY_RE.lastIndex = 0
    const fixed = s.replace(KEY_RE, (m) => m.replace(/Astro/g, 'BrowserOS'))
    changed.push({ id: it.id, kind: d.kind })
    return { id: it.id, data: encode(d.kind, Buffer.from(fixed, 'latin1'), it.data) }
  })
  return { out: changed.length ? buildPak(p) : buf, changed }
}
