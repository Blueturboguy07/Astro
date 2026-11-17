// Find every http(s) URL compiled into the installed files (ASCII and UTF-16LE).
import fs from 'node:fs'
import path from 'node:path'

const URL_RE = /https?:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]*)?/g
const WIDE_RE = /(?:[\x20-\x7e]\x00){10,}/g
const CHUNK = 32 * 1024 * 1024
const OVERLAP = 4096

function* files(dir, exts) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* files(p, exts)
    else if (exts.includes(path.extname(e.name).toLowerCase())) yield p
  }
}

/** Returns Map(url -> Set(relative file)). */
export function scanUrls(root, exts = ['.exe', '.dll', '.pak', '.json', '.xml', '.js', '.dat']) {
  const found = new Map()
  const add = (u, rel) => {
    const url = u.replace(/[.,;:'")\]]+$/, '')
    if (url.length < 12) return
    if (!found.has(url)) found.set(url, new Set())
    found.get(url).add(rel)
  }
  for (const f of files(root, exts)) {
    const rel = path.relative(root, f)
    const fd = fs.openSync(f, 'r')
    try {
      const size = fs.fstatSync(fd).size
      for (let off = 0; off < size; off += CHUNK) {
        const len = Math.min(CHUNK + OVERLAP, size - off)
        const buf = Buffer.alloc(len)
        fs.readSync(fd, buf, 0, len, off)
        const s = buf.toString('latin1')
        for (const m of s.matchAll(URL_RE)) add(m[0], rel)
        for (const w of s.matchAll(WIDE_RE)) {
          let narrow = ''
          for (let i = 0; i < w[0].length; i += 2) narrow += w[0][i]
          for (const m of narrow.matchAll(URL_RE)) add(m[0], `${rel} (utf16)`)
        }
      }
    } finally {
      fs.closeSync(fd)
    }
  }
  return found
}

/** Visible-ish strings that name the upstream product, ASCII and UTF-16LE, with counts per file. */
export function scanWord(root, word = 'BrowserOS', exts = ['.exe', '.dll', '.pak']) {
  const out = {}
  const ascii = Buffer.from(word, 'latin1')
  const wide = Buffer.from(word, 'utf16le')
  for (const f of files(root, exts)) {
    const rel = path.relative(root, f)
    const buf = fs.readFileSync(f)
    let a = 0
    let w = 0
    for (let i = buf.indexOf(ascii); i !== -1; i = buf.indexOf(ascii, i + 1)) a++
    for (let i = buf.indexOf(wide); i !== -1; i = buf.indexOf(wide, i + 1)) w++
    if (a || w) out[rel] = { ascii: a, utf16: w }
  }
  return out
}
