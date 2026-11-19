/**
 * @license
 * Copyright 2026 publik
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Signs Astro's update packages and writes the release manifest publik serves
 * from (astro-update.json). The private key comes from the environment
 * variable ASTRO_UPDATE_KEY (base64 Ed25519 seed): in CI the repo secret, on
 * the Mac `security find-generic-password -s astro-update-key -a private -w`.
 * Nothing here prints key material.
 *
 *   bun astro-update.ts public-key
 *   bun astro-update.ts manifest --app-version 0.2.7 [--mac Astro.dmg] [--win Astro-Update.exe] --out astro-update.json
 *   bun astro-update.ts appcast --os macos|windows --manifest astro-update.json --url <enclosure url>
 *   bun astro-update.ts appcast --os macos|windows --none
 *   bun astro-update.ts verify --file <path> --sig <base64>
 *
 * --other-key lets a proof sign with a key that is not Astro's (the
 * "wrong key" case); a release never passes it.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

import {
  ASTRO_UPDATE_PUBLIC_KEY,
  appcastXml,
  MAC_UPDATE_ASSET,
  publicKeyFromSeed,
  signFile,
  type UpdateManifest,
  updateVersion,
  validateAppVersion,
  verifyBytes,
  WIN_UPDATE_ASSET,
} from './astro-updater'

function get(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}

function key(argv: string[]): string {
  const seed = process.env.ASTRO_UPDATE_KEY
  if (!seed) throw new Error('ASTRO_UPDATE_KEY is not set')
  const pub = publicKeyFromSeed(seed)
  if (pub !== ASTRO_UPDATE_PUBLIC_KEY && !argv.includes('--other-key')) {
    throw new Error(
      "ASTRO_UPDATE_KEY is not the private half of ASTRO_UPDATE_PUBLIC_KEY (astro-updater.ts). Refusing to sign: a build trusts only Astro's key.",
    )
  }
  return seed
}

export function makeManifest(argv: string[]): UpdateManifest {
  const appVersion = validateAppVersion(get(argv, '--app-version') ?? '')
  const seed = key(argv)
  const mac = get(argv, '--mac')
  const win = get(argv, '--win')
  if (!mac && !win) throw new Error('manifest needs --mac and/or --win')
  const manifest: UpdateManifest = {
    app_version: appVersion,
    update_version: updateVersion(appVersion),
  }
  if (mac) manifest.macos = signFile(mac, MAC_UPDATE_ASSET, seed)
  if (win) manifest.windows = signFile(win, WIN_UPDATE_ASSET, seed)
  return manifest
}

function main(argv: string[]): void {
  const cmd = argv[0]
  if (cmd === 'public-key') {
    console.log(publicKeyFromSeed(key(argv)))
    return
  }
  if (cmd === 'manifest') {
    const out = get(argv, '--out') ?? 'astro-update.json'
    const m = makeManifest(argv)
    fs.writeFileSync(out, `${JSON.stringify(m, null, 2)}\n`)
    for (const [os, f] of Object.entries({ macos: m.macos, windows: m.windows })) {
      if (f) console.log(`${os}: ${f.file} ${f.length} bytes, sha256 ${f.sha256}, signed`)
    }
    console.log(`wrote ${path.resolve(out)} (update version ${m.update_version})`)
    return
  }
  if (cmd === 'appcast') {
    const os = get(argv, '--os')
    if (os !== 'macos' && os !== 'windows') throw new Error('--os macos|windows')
    if (argv.includes('--none')) {
      process.stdout.write(appcastXml(os, null))
      return
    }
    const m = JSON.parse(fs.readFileSync(get(argv, '--manifest') ?? '', 'utf8')) as UpdateManifest
    const f = os === 'macos' ? m.macos : m.windows
    const url = get(argv, '--url')
    if (!f || !url) throw new Error(`the manifest has no ${os} file, or --url is missing`)
    process.stdout.write(
      appcastXml(os, { appVersion: m.app_version, url, length: f.length, edSignature: f.ed_signature }),
    )
    return
  }
  if (cmd === 'verify') {
    const file = get(argv, '--file')
    const sig = get(argv, '--sig')
    if (!file || !sig) throw new Error('verify --file <path> --sig <base64> [--pub <base64>]')
    const ok = verifyBytes(fs.readFileSync(file), sig, get(argv, '--pub') ?? ASTRO_UPDATE_PUBLIC_KEY)
    console.log(ok ? 'signature ok' : 'signature does NOT verify')
    if (!ok) process.exit(2)
    return
  }
  throw new Error('commands: public-key | manifest | appcast | verify')
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2))
  } catch (err) {
    console.error(`astro-update: ${(err as Error).message}`)
    process.exit(1)
  }
}
