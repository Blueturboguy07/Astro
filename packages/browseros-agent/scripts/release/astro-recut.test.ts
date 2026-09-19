import { describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ASTRO_EXTENSION_ID,
  bumpBundledExtension,
  codesignArgs,
  countAscii,
  crxManifestVersion,
  crxZipOffset,
  DEVELOPER_ID,
  NOTARY_PROFILE,
  notarizeCommands,
  PUBLIK_APPCAST_URL,
  parseArgs,
  patchAsciiInPlace,
  plutilArgs,
  sparklePlistOps,
  UPSTREAM_AGENT_EXTENSION_ID,
  UPSTREAM_APPCAST_URL,
  validateExtensionVersion,
} from './astro-recut'

const ascii = (s: string) => new TextEncoder().encode(s)

describe('the two byte-patches the re-cut depends on', () => {
  it('both extension ids are 32 characters, so the id swap is length-preserving', () => {
    expect(ASTRO_EXTENSION_ID).toHaveLength(32)
    expect(UPSTREAM_AGENT_EXTENSION_ID).toHaveLength(32)
    expect(ASTRO_EXTENSION_ID).not.toBe(UPSTREAM_AGENT_EXTENSION_ID)
  })

  it('the publik appcast url is exactly as long as upstream’s', () => {
    /* A string inside a Mach-O can be overwritten but not resized: every
       offset after it assumes the old length. */
    expect(PUBLIK_APPCAST_URL).toHaveLength(UPSTREAM_APPCAST_URL.length)
    expect(new URL(PUBLIK_APPCAST_URL).hostname).toBe('publikhq.com')
  })

  it('overwrites every occurrence in place and leaves the length alone', () => {
    const buf = ascii(`xx${UPSTREAM_APPCAST_URL}yy${UPSTREAM_APPCAST_URL}zz`)
    const before = buf.length
    const patch = patchAsciiInPlace(
      buf,
      UPSTREAM_APPCAST_URL,
      PUBLIK_APPCAST_URL,
    )
    expect(patch.occurrences).toBe(2)
    expect(buf.length).toBe(before)
    expect(new TextDecoder().decode(buf)).toBe(
      `xx${PUBLIK_APPCAST_URL}yy${PUBLIK_APPCAST_URL}zz`,
    )
    expect(countAscii(buf, UPSTREAM_APPCAST_URL)).toBe(0)
  })

  it('refuses a replacement of a different length', () => {
    const buf = ascii(UPSTREAM_APPCAST_URL)
    expect(() =>
      patchAsciiInPlace(
        buf,
        UPSTREAM_APPCAST_URL,
        'https://publikhq.com/astro/appcast',
      ),
    ).toThrow(/same length/)
  })

  it('throws when the string is absent rather than shipping an unpatched binary', () => {
    expect(() =>
      patchAsciiInPlace(
        ascii('nothing to see'),
        UPSTREAM_APPCAST_URL,
        PUBLIK_APPCAST_URL,
      ),
    ).toThrow(/not found/)
  })
})

describe('bundled_extensions.json', () => {
  const manifest = {
    adlpneommgkgeanpaekgoaolcpncohkf: {
      external_crx: 'adlpn.crx',
      external_version: '54.0.0.0',
    },
    [ASTRO_EXTENSION_ID]: {
      external_crx: `${ASTRO_EXTENSION_ID}.crx`,
      external_version: '0.0.100',
    },
  }

  it('bumps only Astro’s entry and leaves upstream’s bug reporter alone', () => {
    const next = bumpBundledExtension(manifest, {
      extensionId: ASTRO_EXTENSION_ID,
      crxFileName: `${ASTRO_EXTENSION_ID}.crx`,
      version: '0.0.101',
    })
    expect(next[ASTRO_EXTENSION_ID]?.external_version).toBe('0.0.101')
    expect(next.adlpneommgkgeanpaekgoaolcpncohkf).toEqual(
      manifest.adlpneommgkgeanpaekgoaolcpncohkf,
    )
    /* Pure: the input is not mutated. */
    expect(manifest[ASTRO_EXTENSION_ID].external_version).toBe('0.0.100')
  })

  it('refuses a bundle whose manifest never heard of Astro', () => {
    expect(() =>
      bumpBundledExtension(
        { adlpneommgkgeanpaekgoaolcpncohkf: { external_version: '54.0.0.0' } },
        {
          extensionId: ASTRO_EXTENSION_ID,
          crxFileName: 'x.crx',
          version: '0.0.101',
        },
      ),
    ).toThrow(/no entry for/)
  })

  it('rejects a version chrome would not accept', () => {
    expect(validateExtensionVersion('0.0.101')).toBe('0.0.101')
    expect(validateExtensionVersion('1')).toBe('1')
    expect(() => validateExtensionVersion('0.0.101-beta')).toThrow(/integers/)
    expect(() => validateExtensionVersion('1.2.3.4.5')).toThrow(/integers/)
  })
})

describe('CRX3', () => {
  const makeCrx = (zip: Uint8Array, headerSize = 8): Uint8Array => {
    const out = new Uint8Array(12 + headerSize + zip.length)
    out.set(ascii('Cr24'), 0)
    const view = new DataView(out.buffer)
    view.setUint32(4, 3, true)
    view.setUint32(8, headerSize, true)
    out.set(zip, 12 + headerSize)
    return out
  }

  it('finds where the zip starts', () => {
    const zip = ascii('PK\u0003\u0004rest-of-the-zip')
    expect(crxZipOffset(makeCrx(zip, 16))).toBe(28)
  })

  it('rejects anything that is not a CRX3', () => {
    expect(() => crxZipOffset(ascii('PK\u0003\u0004aaaaaaaaaaaa'))).toThrow(
      /Not a CRX/,
    )
    const wrongFormat = makeCrx(ascii('zip'))
    new DataView(wrongFormat.buffer).setUint32(4, 2, true)
    expect(() => crxZipOffset(wrongFormat)).toThrow(/format version 2/)
  })

  it('reads the packed manifest’s version, so external_version cannot drift', () => {
    const dir = mkdtempSync(join(tmpdir(), 'astro-recut-'))
    try {
      const src = join(dir, 'src')
      Bun.spawnSync(['mkdir', '-p', src])
      writeFileSync(
        join(src, 'manifest.json'),
        JSON.stringify({
          name: 'Astro',
          version: '0.0.101',
          manifest_version: 3,
        }),
      )
      const zipPath = join(dir, 'ext.zip')
      const zipped = Bun.spawnSync(
        ['zip', '-q', '-r', zipPath, 'manifest.json'],
        {
          cwd: src,
        },
      )
      expect(zipped.exitCode).toBe(0)
      const crxPath = join(dir, 'ext.crx')
      writeFileSync(crxPath, makeCrx(new Uint8Array(readFileSync(zipPath)), 24))
      expect(crxManifestVersion(crxPath)).toBe('0.0.101')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('the Sparkle trap (R29 finding 5, D33)', () => {
  it('disable turns off automatic checks and repoints the feed', () => {
    const ops = sparklePlistOps({ mode: 'disable' })
    const byKey = Object.fromEntries(ops.map((o) => [o.key, o.value]))
    expect(byKey.SUEnableAutomaticChecks).toBe('NO')
    expect(byKey.SUAutomaticallyUpdate).toBe('NO')
    expect(byKey.SUScheduledCheckInterval).toBe('0')
    expect(byKey.SUFeedURL).toBe(PUBLIK_APPCAST_URL)
    /* Upstream's EdDSA key is left in place unless publik has one: a feed
       publik cannot sign is a feed nothing can install from, which is the
       safe direction. */
    expect(byKey.SUPublicEDKey).toBeUndefined()
  })

  it('writes an EdDSA key only when one is supplied', () => {
    const ops = sparklePlistOps({ mode: 'disable', edKey: 'AAAAkey==' })
    expect(ops.find((o) => o.key === 'SUPublicEDKey')?.value).toBe('AAAAkey==')
  })

  it('keep leaves every Sparkle key as upstream shipped it', () => {
    expect(sparklePlistOps({ mode: 'keep' })).toEqual([])
  })

  it('builds plutil calls that replace, never append', () => {
    expect(
      plutilArgs('/A.app/Contents/Info.plist', {
        key: 'SUEnableAutomaticChecks',
        type: 'bool',
        value: 'NO',
      }),
    ).toEqual([
      '-replace',
      'SUEnableAutomaticChecks',
      '-bool',
      'NO',
      '/A.app/Contents/Info.plist',
    ])
  })
})

describe('signing and notarization', () => {
  it('signs hardened, timestamped, with publik’s Developer ID', () => {
    expect(DEVELOPER_ID).toContain('R5R3ZS54LV')
    const args = codesignArgs('/out/Astro.app', DEVELOPER_ID)
    expect(args).toContain('--timestamp')
    expect(args).toContain('runtime')
    expect(args.at(-1)).toBe('/out/Astro.app')
  })

  it('notarizes through the keychain profile the other publik apps use', () => {
    const cmds = notarizeCommands('/out/Astro.dmg')
    expect(cmds[0]).toContain(`--keychain-profile ${NOTARY_PROFILE}`)
    expect(cmds[0]).toContain('--wait')
    expect(cmds[1]).toContain('stapler staple')
  })
})

describe('argument parsing', () => {
  it('defaults to disabling Sparkle and to publik’s Developer ID', () => {
    const opts = parseArgs(['--source', 'A.app', '--crx', 'a.crx'])
    expect(opts.sparkle).toBe('disable')
    expect(opts.identity).toBe(DEVELOPER_ID)
    expect(opts.sign).toBe(false)
    expect(opts.patchId).toBe(false)
    expect(opts.out).toBe('dist/astro-recut')
  })

  it('refuses a feed url that would resize the string in the framework', () => {
    expect(() =>
      parseArgs([
        '--source',
        'A.app',
        '--crx',
        'a.crx',
        '--sparkle-feed',
        'https://publikhq.com/astro/appcast',
      ]),
    ).toThrow(/exactly 33 characters/)
  })

  it('needs both a source bundle and a CRX', () => {
    expect(() => parseArgs(['--source', 'A.app'])).toThrow(/Usage/)
    expect(() => parseArgs(['--crx', 'a.crx'])).toThrow(/Usage/)
  })
})
