import { describe, expect, it } from 'bun:test'
import * as zlib from 'node:zlib'
import {
  parsePak,
  rebrandPakBuffer,
  rebrandText,
  renamedI18nKeys,
  selfTestRebrand,
} from './pak-rebrand'

/* A minimal DataPack v5: header, index (+ sentinel), no aliases, entries. */
function makePak(entries: { id: number; data: Uint8Array }[]): Uint8Array {
  const headerLen = 12 + (entries.length + 1) * 6
  const total = headerLen + entries.reduce((n, e) => n + e.data.length, 0)
  const out = Buffer.alloc(total)
  out.writeUInt32LE(5, 0)
  out.writeUInt8(1, 4)
  out.writeUInt16LE(entries.length, 8)
  out.writeUInt16LE(0, 10)
  let off = headerLen
  entries.forEach((e, i) => {
    out.writeUInt16LE(e.id, 12 + i * 6)
    out.writeUInt32LE(off, 14 + i * 6)
    out.set(e.data, off)
    off += e.data.length
  })
  out.writeUInt16LE(0, 12 + entries.length * 6)
  out.writeUInt32LE(off, 14 + entries.length * 6)
  return out
}

const text = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'))
const decoded = (pak: Uint8Array, i: number) => {
  const d = parsePak(pak).items[i].data
  return d[0] === 0x1f && d[1] === 0x8b
    ? zlib.gunzipSync(d).toString('latin1')
    : Buffer.from(d).toString('latin1')
}

/* Astro 0.2.4 QA, F-009: the settings bundle's
   `$i18n{aboutBrowserOSVersion}` became `$i18n{aboutAstroVersion}` and
   chrome://settings never finished loading. */
const SETTINGS_SNIPPET =
  '<div class="secondary">BrowserOS - $i18n{aboutBrowserOSVersion}</div>'

describe('rebrandText', () => {
  it('renames the product name but never an identifier that contains it', () => {
    const { out, changed } = rebrandText(Buffer.from(SETTINGS_SNIPPET))
    expect(out.toString()).toBe(
      '<div class="secondary">Astro - $i18n{aboutBrowserOSVersion}</div>',
    )
    expect(changed).toBe(1)
    expect(rebrandText(Buffer.from('class BrowserOSPrefs {}')).changed).toBe(0)
    expect(rebrandText(Buffer.from('getBrowserOS_id')).changed).toBe(0)
  })

  it('still renames text that follows a message placeholder', () => {
    expect(
      rebrandText(Buffer.from('dangerous$1BrowserOS can check')).out.toString(),
    ).toBe('dangerous$1Astro can check')
    expect(
      rebrandText(
        Buffer.from("About BrowserOS. BrowserOS's menu"),
      ).out.toString(),
    ).toBe("About Astro. Astro's menu")
  })
})

describe('rebrandPakBuffer + selfTestRebrand', () => {
  it('keeps $i18n keys and passes the self-test', () => {
    const pak = makePak([
      { id: 10, data: text(SETTINGS_SNIPPET) },
      { id: 11, data: zlib.gzipSync(Buffer.from('About BrowserOS')) },
    ])
    const { out, changed } = rebrandPakBuffer(pak)
    expect(changed).toBe(2)
    expect(decoded(out, 0)).toContain('$i18n{aboutBrowserOSVersion}')
    expect(decoded(out, 1)).toBe('About Astro')
    expect(selfTestRebrand(pak, out)).toEqual([])
    expect(renamedI18nKeys(out)).toEqual([])
  })

  it('fails a pak whose $i18n keys changed (what 0.2.4 shipped)', () => {
    const pak = makePak([{ id: 10, data: text(SETTINGS_SNIPPET) }])
    const shipped = makePak([
      {
        id: 10,
        data: text(
          '<div class="secondary">Astro - $i18n{aboutAstroVersion}</div>',
        ),
      },
    ])
    expect(selfTestRebrand(pak, shipped).join(' ')).toMatch(
      /\$i18n keys changed in entry 10/,
    )
    expect(renamedI18nKeys(shipped)).toEqual(['aboutAstroVersion'])
  })
})
