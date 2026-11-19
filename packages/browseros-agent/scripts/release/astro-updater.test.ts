import { describe, expect, it } from 'bun:test'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PUBLIK_APPCAST_URL, UPSTREAM_APPCAST_URL } from './astro-recut'
import { UPSTREAM_WINSPARKLE_FEED } from './astro-recut-win'
import {
  ASTRO_UPDATE_PUBLIC_KEY,
  appcastXml,
  compareVersions,
  MAC_FEED_BASE,
  publicKeyFromSeed,
  signBytes,
  signFile,
  UPSTREAM_ED_PUBLIC_KEY,
  updateVersion,
  validatePublicKey,
  verifyBytes,
  WIN_FEED_LENGTH,
  windowsFeedUrl,
} from './astro-updater'

function testSeed(): string {
  const { privateKey } = generateKeyPairSync('ed25519')
  return Buffer.from(String(privateKey.export({ format: 'jwk' }).d), 'base64url').toString('base64')
}

describe('keys', () => {
  it("Astro's key is a valid Ed25519 public key and is not upstream's", () => {
    expect(validatePublicKey(ASTRO_UPDATE_PUBLIC_KEY)).toBe(ASTRO_UPDATE_PUBLIC_KEY)
    expect(ASTRO_UPDATE_PUBLIC_KEY).not.toBe(UPSTREAM_ED_PUBLIC_KEY)
    /* Same length: the Windows re-cut overwrites one with the other inside chrome.dll. */
    expect(ASTRO_UPDATE_PUBLIC_KEY.length).toBe(UPSTREAM_ED_PUBLIC_KEY.length)
  })

  it('rejects malformed keys', () => {
    expect(() => validatePublicKey('short')).toThrow()
    expect(() => validatePublicKey(`${'A'.repeat(43)}`)).toThrow()
  })
})

describe('versions', () => {
  it('offers 10001.<Astro version>, above every upstream 10000.x build', () => {
    expect(updateVersion('0.2.7')).toBe('10001.0.2.7')
    expect(updateVersion('v0.2.7')).toBe('10001.0.2.7')
    expect(compareVersions(updateVersion('0.2.7'), '10000.0.51.0.0')).toBe(1)
    expect(compareVersions(updateVersion('0.2.7'), '10000.0.47.18.0')).toBe(1)
  })

  it('orders Astro releases numerically', () => {
    expect(compareVersions(updateVersion('0.2.10'), updateVersion('0.2.9'))).toBe(1)
    expect(compareVersions(updateVersion('0.3.0'), updateVersion('0.2.99'))).toBe(1)
    expect(compareVersions(updateVersion('0.2.7'), updateVersion('0.2.7'))).toBe(0)
  })

  it('refuses a version that is not x.y.z', () => {
    expect(() => updateVersion('0.2')).toThrow()
    expect(() => updateVersion('0.2.7-beta')).toThrow()
  })
})

describe('feed URLs (same-length overwrites)', () => {
  it('the macOS feed base is as long as the strings it replaces', () => {
    expect(MAC_FEED_BASE).toHaveLength(UPSTREAM_APPCAST_URL.length)
    expect(MAC_FEED_BASE).toHaveLength(PUBLIK_APPCAST_URL.length)
    expect(MAC_FEED_BASE).not.toBe(PUBLIK_APPCAST_URL)
  })

  it('every Windows feed URL is 41 bytes, like upstream WinSparkle feed', () => {
    expect(UPSTREAM_WINSPARKLE_FEED).toHaveLength(WIN_FEED_LENGTH)
    for (const v of ['0.2.7', '0.2.10', '0.10.10', '1.2.3', '10.20.300']) {
      const url = windowsFeedUrl(v)
      expect(url).toHaveLength(WIN_FEED_LENGTH)
      expect(new URL(url).pathname).toBe(`/astro/up/w/${v}`)
      expect(new URL(url).hostname).toBe('publikhq.com')
    }
  })

  it('refuses a version too long for 41 bytes', () => {
    expect(() => windowsFeedUrl('100.200.3000')).toThrow(/too long/)
  })
})

describe('signing (Sparkle / WinSparkle edSignature)', () => {
  it('signs and verifies a file; another key or one changed byte fails', () => {
    const seed = testSeed()
    const other = testSeed()
    const pub = publicKeyFromSeed(seed)
    const dir = mkdtempSync(join(tmpdir(), 'astro-upd-'))
    try {
      const file = join(dir, 'pkg.bin')
      const data = Buffer.from('an update package')
      writeFileSync(file, data)
      const signed = signFile(file, 'pkg.bin', seed)
      expect(signed.length).toBe(data.length)
      expect(verifyBytes(data, signed.ed_signature, pub)).toBe(true)
      expect(verifyBytes(data, signBytes(data, other), pub)).toBe(false)
      const tampered = Buffer.from(data)
      tampered[3] ^= 1
      expect(verifyBytes(tampered, signed.ed_signature, pub)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('appcastXml', () => {
  it('carries the signed item with the compared version and the display version', () => {
    const xml = appcastXml('windows', {
      appVersion: '0.2.7',
      url: 'https://github.com/x/y/releases/download/v0.2.7/Astro-Update.exe',
      length: 123,
      edSignature: 'c2ln',
    })
    expect(xml).toContain('<sparkle:version>10001.0.2.7</sparkle:version>')
    expect(xml).toContain('<sparkle:shortVersionString>0.2.7</sparkle:shortVersionString>')
    expect(xml).toContain('sparkle:os="windows"')
    expect(xml).toContain('sparkle:edSignature="c2ln"')
    expect(xml).toContain('length="123"')
  })

  it('"nothing newer" is one item at 0.0.0 (an empty channel is a parse error)', () => {
    const xml = appcastXml('macos', null)
    expect(xml).toContain('<sparkle:version>0.0.0</sparkle:version>')
    expect(xml).not.toContain('edSignature')
    expect(xml).toContain('sparkle:os="macos"')
  })
})
