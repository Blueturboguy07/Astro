/**
 * @license
 * Copyright 2026 publik
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Astro's own update channel, shared by the two re-cuts (astro-recut.ts,
 * astro-recut-win.ts) and the release signing step (astro-update.ts).
 *
 * Both platforms already carry an updater from upstream BrowserOS: Sparkle 2
 * on macOS, WinSparkle 0.9.3 on Windows. Both check each download against an
 * Ed25519 public key before they install it. Until now every Astro build kept
 * upstream's key, so nothing publik could sign would ever install. The re-cuts
 * now put Astro's own key in its place and point the feed at publik:
 *
 *   - Key: ASTRO_UPDATE_PUBLIC_KEY below. The private half lives only in the
 *     macOS keychain (service `astro-update-key`, account `private`) and in the
 *     secret ASTRO_UPDATE_KEY of the repo that runs the private build workflow.
 *   - Version: both updaters compare a dotted version. Upstream builds report
 *     `10000.<BrowserOS version>`. Astro's feeds offer `10001.<Astro version>`
 *     (updateVersion), which sorts above every upstream build and grows with
 *     each Astro release.
 *       macOS: the re-cut writes it to CFBundleVersion, which Sparkle compares.
 *       Windows: WinSparkle compares a value compiled into chrome.dll
 *       (`10000.<BrowserOS version>`), the same for every Astro build on one
 *       BrowserOS base. So each Windows build asks a feed URL that names its own
 *       Astro version (windowsFeedUrl), and publik offers an item only to a
 *       build older than the newest release.
 *   - Feed URLs: both are same-length overwrites of upstream's strings inside a
 *     signed / shipped binary (33 bytes on macOS, 41 on Windows). They are new
 *     paths: builds that still trust upstream's key keep asking the old ones,
 *     which publik answers with "nothing newer".
 */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  type KeyObject,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto'
import * as fs from 'node:fs'

/** Astro's update public key (Ed25519, base64 of the 32 raw bytes). */
export const ASTRO_UPDATE_PUBLIC_KEY = 'z12ifWMFBuoy3ixc8RBLzEaZfhaUV9XJMIUTyWdvx7E='

/** Upstream BrowserOS's update key (public; from upstream's winsparkle_glue.cc
    and SUPublicEDKey). Compiled into chrome.dll on Windows. */
export const UPSTREAM_ED_PUBLIC_KEY =
  'LzQmcNuTsdB3/dsivo0eeN+jPfDoriRHAkkEJcfFs2A='

/** First component of every version Astro's feeds offer. Upstream uses 10000. */
export const UPDATE_EPOCH = '10001'

/** macOS: the Sparkle glue appends ".xml" (arm64) or "-x86_64.xml" (Intel) to
    this compiled-in base. 33 bytes, like upstream's https://cdn.browseros.com/appcast. */
export const MAC_FEED_BASE = 'https://publikhq.com/astro/up/mac'

/** Windows: WinSparkle's feed URL is 41 bytes, like upstream's
    https://cdn.browseros.com/appcast-win.xml. */
export const WIN_FEED_PREFIX = 'https://publikhq.com/astro/up/w/'
export const WIN_FEED_LENGTH = 41

/** The release asset that carries the signed items publik serves. */
export const UPDATE_MANIFEST_ASSET = 'astro-update.json'
/** The Windows update package (see astro-win.nsi, UPDATER). */
export const WIN_UPDATE_ASSET = 'Astro-Update.exe'
export const MAC_UPDATE_ASSET = 'Astro.dmg'

export function validateAppVersion(version: string): string {
  const v = version.replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+$/.test(v)) {
    throw new Error(`Astro version must be x.y.z (e.g. 0.2.7), got "${version}"`)
  }
  return v
}

/** The version the updaters compare: 10001.<Astro version>. */
export function updateVersion(appVersion: string): string {
  return `${UPDATE_EPOCH}.${validateAppVersion(appVersion)}`
}

/** -1, 0 or 1, numerically per component. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

/** WinSparkle's feed URL for one Astro build, padded to 41 bytes with an
    ignored query (`?xxx`). */
export function windowsFeedUrl(appVersion: string): string {
  const v = validateAppVersion(appVersion)
  const room = WIN_FEED_LENGTH - WIN_FEED_PREFIX.length - v.length
  if (room < 0) {
    throw new Error(
      `Astro version "${v}" is too long for the 41-byte Windows feed URL`,
    )
  }
  return `${WIN_FEED_PREFIX}${v}${room === 0 ? '' : `?${'x'.repeat(room - 1)}`}`
}

/** Checks a base64 Ed25519 public key (44 characters, 32 bytes). */
export function validatePublicKey(key: string): string {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(key) || Buffer.from(key, 'base64').length !== 32) {
    throw new Error('Update public key must be base64 of 32 bytes (44 characters)')
  }
  return key
}

/* ------------------------------------------------------------------ */
/* Signing: Sparkle's and WinSparkle's sparkle:edSignature is the      */
/* base64 Ed25519 signature of the whole file.                         */
/* ------------------------------------------------------------------ */

const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')

/** The private key from its base64 32-byte seed (the keychain / secret form). */
export function privateKeyFromSeed(seedB64: string): KeyObject {
  const seed = Buffer.from(seedB64.trim(), 'base64')
  if (seed.length !== 32) throw new Error('Update private key must be base64 of 32 bytes')
  return createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8',
  })
}

export function publicKeyFromSeed(seedB64: string): string {
  const jwk = createPublicKey(privateKeyFromSeed(seedB64)).export({ format: 'jwk' })
  return Buffer.from(String(jwk.x), 'base64url').toString('base64')
}

function publicKeyObject(pubB64: string): KeyObject {
  return createPublicKey({
    key: {
      kty: 'OKP',
      crv: 'Ed25519',
      x: Buffer.from(validatePublicKey(pubB64), 'base64').toString('base64url'),
    },
    format: 'jwk',
  })
}

export function signBytes(data: Uint8Array, seedB64: string): string {
  return cryptoSign(null, data, privateKeyFromSeed(seedB64)).toString('base64')
}

export function verifyBytes(data: Uint8Array, sigB64: string, pubB64: string): boolean {
  return cryptoVerify(null, data, publicKeyObject(pubB64), Buffer.from(sigB64, 'base64'))
}

export type SignedFile = {
  file: string
  length: number
  sha256: string
  ed_signature: string
}

export function signFile(filePath: string, name: string, seedB64: string): SignedFile {
  const data = fs.readFileSync(filePath)
  return {
    file: name,
    length: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
    ed_signature: signBytes(data, seedB64),
  }
}

/* ------------------------------------------------------------------ */
/* The release manifest (astro-update.json) and the appcast built from */
/* it. publik builds the same XML (lib/astro-server-appcast.ts).        */
/* ------------------------------------------------------------------ */

export type UpdateManifest = {
  app_version: string
  update_version: string
  macos?: SignedFile
  windows?: SignedFile
}

export type AppcastItem = {
  appVersion: string
  url: string
  length: number
  edSignature: string
}

function xmlEscape(value: string): string {
  return value.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  )
}

export function appcastXml(os: 'macos' | 'windows', item: AppcastItem | null): string {
  const title = os === 'windows' ? 'Astro for Windows' : 'Astro'
  const body = item
    ? `    <item>
      <title>Astro ${xmlEscape(item.appVersion)}</title>
      <sparkle:version>${xmlEscape(updateVersion(item.appVersion))}</sparkle:version>
      <sparkle:shortVersionString>${xmlEscape(item.appVersion)}</sparkle:shortVersionString>
      <link>https://publikhq.com/astro</link>
      <enclosure url="${xmlEscape(item.url)}" sparkle:os="${os}" length="${item.length}" type="application/octet-stream" sparkle:edSignature="${xmlEscape(item.edSignature)}" />
    </item>
`
    : `    <item>
      <title>Astro (current)</title>
      <sparkle:version>0.0.0</sparkle:version>
      <link>https://publikhq.com/astro</link>
      <enclosure url="https://publikhq.com/astro" sparkle:os="${os}" length="0" type="application/octet-stream" />
    </item>
`
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>${xmlEscape(title)}</title>
    <link>https://publikhq.com/astro</link>
    <description>Astro updates, signed with Astro's update key.</description>
    <language>en</language>
${body}  </channel>
</rss>
`
}
