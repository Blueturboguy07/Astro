import { describe, expect, it } from 'bun:test'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ASTRO_EXTENSION_ID, UPSTREAM_AGENT_EXTENSION_ID } from './astro-recut'
import {
  astroBundledManifest,
  BUGREPORTER_EXTENSION_ID,
  checkServerResources,
  chromeVersionDir,
  exeVersionStrings,
  parseArgs,
  patchChromeDllUrls,
  REBRANDED_EXES,
  rceditArgs,
  validateAppVersion,
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
  it('requires --tree, --crx, --server, --version and --app-version', () => {
    expect(() => parseArgs(['--tree', 't', '--crx', 'c'])).toThrow(/Usage/)
    /* F-051: without --server the build shipped upstream's server. */
    expect(() =>
      parseArgs([
        '--tree',
        't',
        '--crx',
        'c',
        '--version',
        '0.0.101',
        '--app-version',
        '0.2.4',
      ]),
    ).toThrow(/--server/)
    expect(() =>
      parseArgs(['--tree', 't', '--crx', 'c', '--version', '0.0.101']),
    ).toThrow(/Usage/)
  })

  /* QA F-014: Add/Remove Programs showed 0.0.103 (the CRX) for Astro 0.2.4. */
  it('keeps the Astro release version apart from the CRX version', () => {
    const o = parseArgs([
      '--tree',
      't',
      '--crx',
      'c.crx',
      '--server',
      'srv',
      '--version',
      '0.0.103',
      '--app-version',
      'v0.2.4',
    ])
    expect(o.version).toBe('0.0.103')
    expect(o.appVersion).toBe('0.2.4')
    expect(() => validateAppVersion('0.0.103.1')).toThrow(/x\.y\.z/)
  })

  it('defaults to the nsis package and dist/win', () => {
    const o = parseArgs([
      '--tree',
      't',
      '--crx',
      'c.crx',
      '--server',
      'srv',
      '--version',
      '0.0.101',
      '--app-version',
      '0.2.4',
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
        '--server',
        'srv',
        '--version',
        '0.0.101',
        '--app-version',
        '0.2.4',
        '--package',
        'msi',
      ]),
    ).toThrow(/must be "nsis" or "zip"/)
  })
})

/* Astro 0.2.4 QA, F-051: the Windows build shipped upstream's server. */
describe('checkServerResources', () => {
  const make = (exeHead: string, migrations = true) => {
    const dir = mkdtempSync(join(tmpdir(), 'astro-srv-'))
    mkdirSync(join(dir, 'bin'))
    writeFileSync(join(dir, 'bin', 'browseros_server.exe'), exeHead)
    if (migrations)
      mkdirSync(join(dir, 'db', 'migrations', 'meta'), { recursive: true })
    return dir
  }

  it('accepts a Windows executable with its migrations', () => {
    const dir = make('MZ\x90\x00')
    expect(() => checkServerResources(dir)).not.toThrow()
    rmSync(dir, { recursive: true })
  })

  it('refuses a macOS binary or missing migrations', () => {
    const mac = make('\xcf\xfa\xed\xfe')
    expect(() => checkServerResources(mac)).toThrow(/not a Windows executable/)
    rmSync(mac, { recursive: true })
    const bare = make('MZ', false)
    expect(() => checkServerResources(bare)).toThrow(/migrations/)
    rmSync(bare, { recursive: true })
  })
})

/* F-015: chrome.exe showed "BrowserOS" in Task Manager and Properties. */
describe('chrome.exe version info (F-015)', () => {
  it('names Astro in every string rcedit writes', () => {
    const strings = exeVersionStrings()
    expect(strings.ProductName).toBe('Astro')
    expect(strings.FileDescription).toBe('Astro')
    expect(strings.CompanyName).toBe('publik')
    const visible = `${strings.ProductName} ${strings.FileDescription} ${strings.CompanyName}`
    expect(visible).not.toMatch(/BrowserOS|Felafax/)
    expect([...REBRANDED_EXES]).toEqual(['chrome.exe', 'chrome_proxy.exe'])
  })

  it('builds one --set-version-string per key, exe first', () => {
    expect(rceditArgs('C:/t/chrome.exe', { ProductName: 'Astro' })).toEqual([
      'C:/t/chrome.exe',
      '--set-version-string',
      'ProductName',
      'Astro',
    ])
  })

  it('reads --rcedit and leaves it out by default', () => {
    const base = [
      '--tree',
      't',
      '--crx',
      'c.crx',
      '--server',
      'srv',
      '--version',
      '0.0.114',
      '--app-version',
      '0.2.4',
    ]
    expect(parseArgs(base).rcedit).toBeUndefined()
    expect(parseArgs([...base, '--rcedit', 'r.exe']).rcedit).toBe('r.exe')
  })
})

describe('release-windows-astro workflow (F-015)', () => {
  it('passes --rcedit to the re-cut and checks the installed version info', () => {
    const wf = readFileSync(
      join(
        import.meta.dir,
        '../../../../.github/workflows/release-windows-astro.yml',
      ),
      'utf8',
    )
    expect(wf).toContain(
      '--rcedit packages/browseros-agent/third_party/bin/rcedit-x64.exe',
    )
    expect(wf).toContain('$vi.ProductName -ne "Astro"')
  })
})

describe("Astro's updater on Windows (--update-key)", () => {
  const { patchUpdateKey, UPSTREAM_WINSPARKLE_FEED, KEY_ANCHOR_WINDOW } =
    require('./astro-recut-win') as typeof import('./astro-recut-win')
  const {
    ASTRO_UPDATE_PUBLIC_KEY,
    UPSTREAM_ED_PUBLIC_KEY,
    windowsFeedUrl,
  } = require('./astro-updater') as typeof import('./astro-updater')

  it('points the WinSparkle feed at the build’s own versioned URL', () => {
    const buf = new Uint8Array(
      ascii(
        'x https://cdn.browseros.com/extensions/extensions.json y ' +
          'https://cdn.browseros.com/extensions/update-manifest.xml z ' +
          `${UPSTREAM_WINSPARKLE_FEED} w`,
      ),
    )
    patchChromeDllUrls(buf, { winSparkleFeed: windowsFeedUrl('0.2.7') })
    const s = new TextDecoder().decode(buf)
    expect(s).toContain('https://publikhq.com/astro/up/w/0.2.7?xx')
    expect(s).not.toContain('/astro/update/win.xml')
  })

  it("replaces only WinSparkle's copy of upstream's key (the one next to its feed URL)", () => {
    const feed = windowsFeedUrl('0.2.7')
    const far = '.'.repeat(KEY_ANCHOR_WINDOW + 10)
    const src = `${UPSTREAM_ED_PUBLIC_KEY}${far}${feed}..${UPSTREAM_ED_PUBLIC_KEY}..`
    const buf = new Uint8Array(ascii(src))
    const res = patchUpdateKey(buf, ASTRO_UPDATE_PUBLIC_KEY, feed)
    const out = new TextDecoder().decode(buf)
    expect(out.length).toBe(src.length)
    expect(res.others).toBe(1)
    /* The far copy (the server updater's) is untouched; the near one is Astro's. */
    expect(out.startsWith(UPSTREAM_ED_PUBLIC_KEY)).toBe(true)
    expect(out.endsWith(`${feed}..${ASTRO_UPDATE_PUBLIC_KEY}..`)).toBe(true)
  })

  it("refuses when no copy of upstream's key is near the feed URL", () => {
    const feed = windowsFeedUrl('0.2.7')
    const buf = new Uint8Array(
      ascii(`${UPSTREAM_ED_PUBLIC_KEY}${'.'.repeat(KEY_ANCHOR_WINDOW + 10)}${feed}`),
    )
    expect(() => patchUpdateKey(buf, ASTRO_UPDATE_PUBLIC_KEY, feed)).toThrow(/No copy/)
  })

  it("refuses a tree without upstream's key", () => {
    const feed = windowsFeedUrl('0.2.7')
    expect(() =>
      patchUpdateKey(new Uint8Array(ascii(`nothing ${feed}`)), ASTRO_UPDATE_PUBLIC_KEY, feed),
    ).toThrow(/not in chrome.dll/)
  })

  it('parses --update-key and rejects a malformed key', () => {
    const base = ['--tree', 't', '--crx', 'c', '--server', 's', '--version', '0.0.101', '--app-version', '0.2.7']
    expect(parseArgs([...base, '--update-key', ASTRO_UPDATE_PUBLIC_KEY]).updateKey).toBe(ASTRO_UPDATE_PUBLIC_KEY)
    expect(parseArgs(base).updateKey).toBeUndefined()
    expect(() => parseArgs([...base, '--update-key', 'nope'])).toThrow()
  })
})
