import { describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ASTRO_EXTENSION_ID,
  applyPhoneHomePatches,
  BUG_REPORTER_EXTENSION_ID,
  bumpBundledExtension,
  codesignArgs,
  countAscii,
  crxManifestVersion,
  crxZipOffset,
  DEVELOPER_ID,
  dropBundledExtension,
  entitlementKeys,
  NOTARY_PROFILE,
  notarizeCommands,
  PHONE_HOME_PATCHES,
  PUBLIK_APPCAST_URL,
  parseArgs,
  patchAsciiInPlace,
  plutilArgs,
  sparklePlistOps,
  UPSTREAM_AGENT_EXTENSION_ID,
  UPSTREAM_APPCAST_URL,
  VISIBLE_STRING_PATCHES,
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

  it('drops the bug reporter and returns its CRX name to delete', () => {
    const { manifest: next, crxFileName } = dropBundledExtension(
      manifest,
      BUG_REPORTER_EXTENSION_ID,
    )
    expect(crxFileName).toBe('adlpn.crx')
    expect(next[BUG_REPORTER_EXTENSION_ID]).toBeUndefined()
    /* Only the Astro agent is left. */
    expect(Object.keys(next)).toEqual([ASTRO_EXTENSION_ID])
    /* Pure: the input is not mutated. */
    expect(manifest[BUG_REPORTER_EXTENSION_ID]).toBeDefined()
  })

  it('fails loud when the extension to drop was never there', () => {
    expect(() =>
      dropBundledExtension(
        { [ASTRO_EXTENSION_ID]: {} },
        BUG_REPORTER_EXTENSION_ID,
      ),
    ).toThrow(/no entry for/)
  })

  it('the bug reporter id is upstream’s 32-character reporter', () => {
    expect(BUG_REPORTER_EXTENSION_ID).toHaveLength(32)
    expect(BUG_REPORTER_EXTENSION_ID).toBe('adlpneommgkgeanpaekgoaolcpncohkf')
    expect(BUG_REPORTER_EXTENSION_ID).not.toBe(ASTRO_EXTENSION_ID)
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

describe('phone-home neutralization (the maintainer must not reach browseros.com)', () => {
  it('every replacement is the exact byte length of the string it overwrites', () => {
    for (const { from, to } of PHONE_HOME_PATCHES) {
      expect(ascii(to).length, `${from} → ${to}`).toBe(ascii(from).length)
    }
  })

  it('sends the extension config and update-manifest to a dead .invalid host', () => {
    const config = PHONE_HOME_PATCHES.find((p) =>
      p.from.endsWith('/extensions/extensions.json'),
    )
    expect(config?.to).toBe(
      'https://cdn.astro.invalid/extensions/extensions.json',
    )
    const manifestUrl = PHONE_HOME_PATCHES.find((p) =>
      p.from.endsWith('/extensions/update-manifest.xml'),
    )
    expect(new URL(manifestUrl!.to).hostname.endsWith('.invalid')).toBe(true)
    /* The whole maintainer namespace and the OTA host leave browseros.com. */
    for (const { to } of PHONE_HOME_PATCHES) {
      expect(to).not.toContain('browseros.com')
    }
  })

  it('repoints the server OTA channel to publik, not to a dead host', () => {
    const ota = PHONE_HOME_PATCHES.find((p) =>
      p.from.endsWith('/appcast-server.xml'),
    )
    expect(ota?.to).toBe('https://publikhq.com/astro/update-server.xml')
  })

  it('rewrites every phone-home url in place and leaves none on browseros.com', () => {
    const blob = PHONE_HOME_PATCHES.map((p) => `<<${p.from}>>`).join('|')
    const buf = ascii(blob)
    const applied = applyPhoneHomePatches(buf)
    expect(applied.every((p) => p.occurrences === 1)).toBe(true)
    expect(buf.length).toBe(ascii(blob).length)
    const out = new TextDecoder().decode(buf)
    expect(countAscii(buf, 'cdn.browseros.com/extensions/')).toBe(0)
    expect(countAscii(buf, 'cdn.browseros.com/appcast-server')).toBe(0)
    for (const { to } of PHONE_HOME_PATCHES) expect(out).toContain(to)
  })

  it('tolerates a source that was already patched (a previous Astro.app)', () => {
    /* RELEASING.md: the source may be a prior build, not only stock upstream.
       Every `from` already gone must not throw. */
    const buf = ascii('already-astro: cdn.astro.invalid + publikhq.com only')
    expect(() => applyPhoneHomePatches(buf)).not.toThrow()
  })

  it('fails loud when an unknown browseros.com maintainer url survives', () => {
    /* A source variant whose config path we did not know: no `from` matched,
       but a browseros.com maintainer url is still in the binary. */
    const buf = ascii('https://cdn.browseros.com/extensions/config-v2.json')
    expect(() => applyPhoneHomePatches(buf)).toThrow(/survived/)
  })
})

describe('visible-string swaps', () => {
  it('is empty until the audit hands over verified pairs', () => {
    expect(VISIBLE_STRING_PATCHES).toHaveLength(0)
  })

  it('any pair added must be equal length (patchAsciiInPlace enforces it)', () => {
    for (const { from, to } of VISIBLE_STRING_PATCHES) {
      expect(ascii(to).length, `${from} → ${to}`).toBe(ascii(from).length)
    }
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

  it('passes the entitlements plist through when one is given', () => {
    const args = codesignArgs('/out/Astro.app', DEVELOPER_ID, '/tmp/ent.plist')
    expect(args).toContain('--entitlements')
    expect(args[args.indexOf('--entitlements') + 1]).toBe('/tmp/ent.plist')
    /* --entitlements has to precede --sign/target or codesign ignores it. */
    expect(args.indexOf('--entitlements')).toBeLessThan(args.indexOf('--sign'))
  })

  it('omits --entitlements for a target that carries none', () => {
    expect(codesignArgs('/out/x.dylib', DEVELOPER_ID)).not.toContain(
      '--entitlements',
    )
  })

  it('reads entitlement keys out of a codesign --xml dump', () => {
    const xml =
      '<?xml version="1.0"?><plist version="1.0"><dict>' +
      '<key>com.apple.security.cs.allow-jit</key><true/>' +
      '<key>com.apple.security.cs.disable-library-validation</key><true/>' +
      '</dict></plist>'
    expect(entitlementKeys(xml)).toEqual([
      'com.apple.security.cs.allow-jit',
      'com.apple.security.cs.disable-library-validation',
    ])
    expect(entitlementKeys(undefined)).toEqual([])
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
