import { describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ASTRO_EXTENSION_ID, UPSTREAM_AGENT_EXTENSION_ID } from './astro-recut'
import {
  astroBundledManifest,
  BUGREPORTER_EXTENSION_ID,
  chromeVersionDir,
  parseArgs,
  patchChromeDllUrls,
  WIN_URL_PATCHES,
} from './astro-recut-win'

const ascii = (s: string) => new TextEncoder().encode(s)

describe('WIN_URL_PATCHES — the same-length invariant', () => {
  it('every from/to pair is exactly equal length in bytes', () => {
    for (const p of WIN_URL_PATCHES) {
      expect(ascii(p.to).length).toBe(ascii(p.from).length)
    }
  })

  it('no replacement still points at browseros.com', () => {
    for (const p of WIN_URL_PATCHES) {
      expect(p.to).not.toContain('browseros.com')
    }
  })

  it('the extension config and update-manifest urls are required', () => {
    const required = WIN_URL_PATCHES.filter((p) => p.required).map(
      (p) => p.from,
    )
    expect(required).toContain(
      'https://cdn.browseros.com/extensions/extensions.json',
    )
    expect(required).toContain(
      'https://cdn.browseros.com/extensions/update-manifest.xml',
    )
    expect(required).toContain('https://cdn.browseros.com/appcast-win.xml')
  })
})

describe('patchChromeDllUrls', () => {
  it('rewrites every url present and reports occurrence counts', () => {
    const buf = new Uint8Array(
      ascii(
        'x https://cdn.browseros.com/extensions/extensions.json y ' +
          'https://cdn.browseros.com/extensions/update-manifest.xml z ' +
          'https://cdn.browseros.com/appcast-win.xml w',
      ),
    )
    const patches = patchChromeDllUrls(buf)
    const decoded = new TextDecoder().decode(buf)
    expect(decoded).not.toContain('browseros.com')
    expect(decoded).toContain('publikhq.com')
    const hit = patches.filter((p) => p.occurrences > 0)
    expect(hit.length).toBeGreaterThanOrEqual(3)
  })

  it('throws when a required url is absent (wrong tree)', () => {
    const buf = new Uint8Array(ascii('a tree that is not browseros'))
    expect(() => patchChromeDllUrls(buf)).toThrow(/Required url not found/)
  })

  it('is length-preserving on the buffer', () => {
    const src =
      'pre https://cdn.browseros.com/extensions/extensions.json ' +
      'https://cdn.browseros.com/extensions/update-manifest.xml ' +
      'https://cdn.browseros.com/appcast-win.xml post'
    const buf = new Uint8Array(ascii(src))
    const before = buf.length
    patchChromeDllUrls(buf)
    expect(buf.length).toBe(before)
  })
})

describe('astroBundledManifest', () => {
  it('lists only the Astro agent — no upstream id, no bug reporter', () => {
    const m = astroBundledManifest(`${ASTRO_EXTENSION_ID}.crx`, '0.0.101')
    expect(Object.keys(m)).toEqual([ASTRO_EXTENSION_ID])
    expect(m[ASTRO_EXTENSION_ID].external_version).toBe('0.0.101')
    const raw = JSON.stringify(m)
    expect(raw).not.toContain(UPSTREAM_AGENT_EXTENSION_ID)
    expect(raw).not.toContain(BUGREPORTER_EXTENSION_ID)
  })

  it('rejects a non-numeric version', () => {
    expect(() => astroBundledManifest('x.crx', 'not-a-version')).toThrow()
  })
})

describe('chromeVersionDir', () => {
  it('finds the single versioned payload dir', () => {
    const root = mkdtempSync(join(tmpdir(), 'astro-win-'))
    try {
      mkdirSync(join(root, '151.0.8162.137'))
      writeFileSync(join(root, 'chrome.exe'), 'stub')
      expect(chromeVersionDir(root)).toBe(join(root, '151.0.8162.137'))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('throws when there is not exactly one versioned dir', () => {
    const root = mkdtempSync(join(tmpdir(), 'astro-win-'))
    try {
      mkdirSync(join(root, '151.0.8162.137'))
      mkdirSync(join(root, '152.0.0.1'))
      expect(() => chromeVersionDir(root)).toThrow(/exactly one/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('parseArgs', () => {
  it('requires --tree, --crx and --version', () => {
    expect(() => parseArgs(['--tree', 't', '--crx', 'c'])).toThrow(/Usage/)
  })

  it('defaults to the nsis package and dist/win', () => {
    const o = parseArgs([
      '--tree',
      't',
      '--crx',
      'c.crx',
      '--version',
      '0.0.101',
    ])
    expect(o.pkg).toBe('nsis')
    expect(o.out).toBe('dist/win')
    expect(o.dryRun).toBe(false)
  })

  it('rejects an unknown --package value', () => {
    expect(() =>
      parseArgs([
        '--tree',
        't',
        '--crx',
        'c.crx',
        '--version',
        '0.0.101',
        '--package',
        'msi',
      ]),
    ).toThrow(/must be "nsis" or "zip"/)
  })
})
