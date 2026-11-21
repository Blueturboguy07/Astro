/**
 * @license
 * Copyright 2026 publik
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Re-cut the WINDOWS Astro build around a freshly built agent extension.
 *
 * The Windows twin of astro-recut.ts. There is no Chromium build here: a
 * branded Chromium is ~100 GB per platform and cannot be cross-compiled, so
 * the shipped Windows app is upstream's PREBUILT tree (BrowserOS_installer.exe
 * -> chrome.7z -> Chrome-bin) with the same three edits the mac recut makes,
 * expressed for the PE world:
 *
 *   1. The agent extension id inside chrome.dll byte-patched from upstream's
 *      (bflpfmnmnokmjhmgnolecpppdbdophmk) to Astro's
 *      (kofbmbngmnnpmopgbhpbajhnnnoflolg). Both are 32 bytes, which is what
 *      makes the patch length-preserving inside a giant DLL whose every
 *      relative offset after the string would otherwise move.
 *   2. Astro's CRX dropped into browseros_extensions/ next to a rewritten
 *      bundled_extensions.json that lists ONLY the Astro id, and the bundled
 *      bug-reporter CRX (adlpneommgkgeanpaekgoaolcpncohkf) deleted.
 *   3. The phone-home URLs compiled into chrome.dll repointed to publikhq.com
 *      hosts (all same-length ASCII overwrites) so the build never reaches
 *      cdn.browseros.com.
 *   3a. With --update-key (Astro's own updater, see astro-updater.ts):
 *      upstream's Ed25519 update key in chrome.dll replaced by Astro's (both
 *      44 bytes), and the WinSparkle feed pointed at a publik URL that names
 *      this build's Astro version. The package step then also makes
 *      Astro-Update-<version>.exe, the file WinSparkle downloads and runs.
 *   3b. With --update-key also --winsparkle: upstream's WinSparkle.dll replaced
 *      by Astro's fork (pinned sha256), WinSparkle.ini written next to it, and
 *      the restart helper compiled (astro-winsparkle.ts): updates download and
 *      install in the background and Astro then asks only for a restart.
 *   4. Upstream's local server (BrowserOSServer\default\resources: the
 *      browseros_server.exe and its DB migrations) replaced by Astro's, built
 *      from this repo's apps/server for windows-x64. Without it the Windows
 *      build shipped upstream's server 0.0.165, which has no /api routes, so
 *      the answer engine could not work (Astro 0.2.4 QA, F-051).
 *
 * The single most important patch is the extension CONFIG url
 * (kBrowserOSConfigUrl = https://cdn.browseros.com/extensions/extensions.json).
 * The extension maintainer polls it every cycle and will REINSTALL the bug
 * reporter if it can reach a config that lists it. Deleting the CRX and
 * rewriting bundled_extensions.json is not enough on its own; neutralising the
 * config url (and the CRX update-manifest url) is what makes the drop stick.
 * The repointed url resolves to a publik path that returns nothing actionable,
 * so the fetch is a no-op and the installed set is never rewritten from the
 * network -- the same safe direction the mac recut takes with astro.invalid.
 *
 * There is no code signing here: publik holds no Windows cert and upstream
 * ships unsigned too (decision in the task brief). The build is a same-length
 * patch of an already-unsigned tree, so nothing to re-seal -- the opposite of
 * the mac recut, whose whole back half is codesign.
 *
 * Packaging is NSIS (route (a) in the brief), not a portable zip, because goal
 * item 12 (Windows) requires an installer with a Start-menu shortcut AND a
 * working uninstaller in Add/Remove Programs. A zip delivers neither. See
 * astro-win.nsi in this directory.
 *
 * Runs on windows-latest under Bun. The extract-from-installer and the CDP
 * install test live in the workflow (.github/workflows/release-windows-astro.yml);
 * this script owns swap + patch + package on an already-extracted tree.
 *
 * Usage (from repo root, on Windows):
 *   bun packages/browseros-agent/scripts/release/astro-recut-win.ts \
 *     --tree  path\to\Chrome-bin \
 *     --crx   path\to\astro-agent.crx \
 *     --server path\to\windows-x64\resources \
 *     --version 0.0.101 \
 *     --app-version 0.2.4 \
 *     --out   dist\win \
 *     [--package nsis|zip] [--nsi <astro-win.nsi>] [--makensis <makensis.exe>] \
 *     [--update-key <base64> --winsparkle <fork WinSparkle.dll>] [--dry-run]
 */
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

import {
  ASTRO_EXTENSION_ID,
  type BinaryPatch,
  countAscii,
  patchAsciiInPlace,
  patchUtf16InPlace,
  UPSTREAM_AGENT_EXTENSION_ID,
  VISIBLE_UTF16_PATCHES,
  validateExtensionVersion,
} from './astro-recut'
import {
  UPSTREAM_ED_PUBLIC_KEY,
  validatePublicKey,
  windowsFeedUrl,
} from './astro-updater'
import {
  checkWinSparkleDll,
  checkWinSparkleLinks,
  RESTART_HELPER_EXE,
  RESTART_HELPER_SOURCE,
  WINSPARKLE_DLL,
  WINSPARKLE_INI,
  winSparkleIni,
} from './astro-winsparkle'
import { rebrandResourcePaks } from './pak-rebrand'

/** The bundled bug reporter. Dropped from Astro: no upstream reporting UI. */
export const BUGREPORTER_EXTENSION_ID = 'adlpneommgkgeanpaekgoaolcpncohkf'

/**
 * Every browseros.com url compiled into chrome.dll, paired with a same-length
 * publikhq.com replacement. Length equality is asserted at load time below --
 * an off-by-one here shifts every byte after the string inside a 320 MB DLL
 * and produces a browser that will not start.
 *
 * `required` marks the urls whose absence means the tree is not the one we
 * think it is (the stable, non-alpha channel strings). The `.alpha.*` variants
 * are patched when present but never required: a channel that drops them is
 * still correctly neutralised.
 *
 * Padding: where a clean publik path is shorter than the browseros url it
 * overwrites, the remainder is an ignored `?p=x...` query. publik never reads
 * it; it exists only to make the byte lengths match.
 */
export const WIN_URL_PATCHES: ReadonlyArray<{
  from: string
  to: string
  required: boolean
  note: string
}> = [
  // Extension CONFIG url -- the maintainer poll. The one that must not reach
  // a config listing the bug reporter. Patched first, required.
  {
    from: 'https://cdn.browseros.com/extensions/extensions.alpha.json',
    to: 'https://publikhq.com/astro/ext/config.json?p=xxxxxxxxxxxxx',
    required: false,
    note: 'kBrowserOSConfigUrl (alpha channel) -> publik no-op',
  },
  {
    from: 'https://cdn.browseros.com/extensions/extensions.json',
    to: 'https://publikhq.com/astro/ext/config.json?p=xxxxxxx',
    required: true,
    note: 'kBrowserOSConfigUrl -> publik no-op (blocks bug-reporter re-add)',
  },
  // CRX update manifest -- where the maintainer would fetch a bundled CRX from.
  {
    from: 'https://cdn.browseros.com/extensions/update-manifest.alpha.xml',
    to: 'https://publikhq.com/astro/ext/updates.xml?p=xxxxxxxxxxxxxxxxx',
    required: false,
    note: 'CRX update manifest (alpha) -> publik no-op',
  },
  {
    from: 'https://cdn.browseros.com/extensions/update-manifest.xml',
    to: 'https://publikhq.com/astro/ext/updates.xml?p=xxxxxxxxxxx',
    required: true,
    note: 'CRX update manifest -> publik no-op',
  },
  // WinSparkle feed -- self-update. Repointed so it can never walk a user back
  // onto stock BrowserOS (which unregisters Astro's id and deletes the agent).
  {
    from: 'https://cdn.browseros.com/appcast-win.xml',
    to: 'https://publikhq.com/astro/update/win.xml',
    required: true,
    note: 'WinSparkle feed -> publik (serves no newer item = no update)',
  },
  // Sparkle server appcasts (present in this channel; repointed for symmetry).
  {
    from: 'https://cdn.browseros.com/appcast-server.alpha.xml',
    to: 'https://publikhq.com/astro/update/server.xml?p=xxx',
    required: false,
    note: 'server appcast (alpha) -> publik',
  },
  {
    from: 'https://cdn.browseros.com/appcast-server.xml',
    to: 'https://publikhq.com/astro/update/server.xml',
    required: false,
    note: 'server appcast -> publik',
  },
]

/** WinSparkle's compiled-in feed (x64 build). */
export const UPSTREAM_WINSPARKLE_FEED = 'https://cdn.browseros.com/appcast-win.xml'

/** Offsets of every occurrence of an ASCII string. */
export function findAscii(buf: Uint8Array, needle: string): number[] {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)
  const n = Buffer.from(needle, 'latin1')
  const at: number[] = []
  for (let i = b.indexOf(n); i >= 0; i = b.indexOf(n, i + 1)) at.push(i)
  return at
}

/** How far (bytes) the WinSparkle key may sit from WinSparkle's feed URL. */
export const KEY_ANCHOR_WINDOW = 64 * 1024

/**
 * Replace WinSparkle's copy of upstream's update key in chrome.dll with
 * Astro's. WinSparkle checks every download against this key
 * (win_sparkle_set_eddsa_public_key), so it decides who can ship an update to
 * this build. Both keys are 44 base64 bytes.
 *
 * chrome.dll holds upstream's key more than once: the browser's server
 * updater (browseros_server_updater.cc) has its own copy for the bundled
 * server's OTA feed. Only WinSparkle's copy changes, so nothing but the app
 * updater trusts a new key. That copy is the one next to WinSparkle's feed
 * URL (`anchor`): both are file-scope constants of winsparkle_glue.cc. Throws
 * when no copy is within KEY_ANCHOR_WINDOW of the anchor.
 */
export function patchUpdateKey(
  buf: Uint8Array,
  key: string,
  anchor: string,
): BinaryPatch & { offset: number; distance: number; others: number } {
  validatePublicKey(key)
  const keys = findAscii(buf, UPSTREAM_ED_PUBLIC_KEY)
  if (keys.length === 0) {
    throw new Error(
      "Upstream's update key is not in chrome.dll: this is not the WinSparkle " +
        'build the re-cut expects. Refusing to guess where the key is.',
    )
  }
  const anchors = findAscii(buf, anchor)
  if (anchors.length !== 1) {
    throw new Error(
      `WinSparkle's feed URL "${anchor}" is in chrome.dll ${anchors.length} times; expected once`,
    )
  }
  let best = keys[0]
  for (const k of keys) {
    if (Math.abs(k - anchors[0]) < Math.abs(best - anchors[0])) best = k
  }
  const distance = Math.abs(best - anchors[0])
  if (distance > KEY_ANCHOR_WINDOW) {
    throw new Error(
      `No copy of upstream's key within ${KEY_ANCHOR_WINDOW} bytes of WinSparkle's feed URL ` +
        `(nearest ${distance}); refusing to patch a key that may not be WinSparkle's`,
    )
  }
  buf.set(new TextEncoder().encode(key), best)
  return {
    from: UPSTREAM_ED_PUBLIC_KEY,
    to: key,
    occurrences: 1,
    offset: best,
    distance,
    others: keys.length - 1,
  }
}

/* Fail loudly at load, not mid-patch, if any pair drifted out of length. */
for (const p of WIN_URL_PATCHES) {
  if (p.from.length !== p.to.length) {
    throw new Error(
      `WIN_URL_PATCHES length mismatch: "${p.from}" (${p.from.length}) != ` +
        `"${p.to}" (${p.to.length})`,
    )
  }
}

const EXTENSIONS_DIR = 'browseros_extensions'
const BUNDLED_MANIFEST = 'bundled_extensions.json'
/* Where the browser starts its local server from, inside <version>\. */
const SERVER_RESOURCES_DIR = path.join(
  'BrowserOSServer',
  'default',
  'resources',
)
const SERVER_EXE = path.join('bin', 'browseros_server.exe')
const SERVER_MIGRATIONS = path.join('db', 'migrations')

/**
 * Checks a built server resources dir (dist/prod/server/windows-x64/resources
 * from `bun scripts/build/server.ts --target=windows-x64`): it must hold a
 * Windows executable (PE, "MZ") and the DB migrations the server applies.
 */
export function checkServerResources(dir: string): void {
  const exe = path.join(dir, SERVER_EXE)
  if (!fs.existsSync(exe)) {
    throw new Error(`--server ${dir} has no ${SERVER_EXE}`)
  }
  const head = Buffer.alloc(2)
  const fd = fs.openSync(exe, 'r')
  try {
    fs.readSync(fd, head, 0, 2, 0)
  } finally {
    fs.closeSync(fd)
  }
  if (head.toString('latin1') !== 'MZ') {
    throw new Error(`--server ${exe} is not a Windows executable`)
  }
  if (!fs.existsSync(path.join(dir, SERVER_MIGRATIONS, 'meta'))) {
    throw new Error(`--server ${dir} has no ${SERVER_MIGRATIONS}`)
  }
}

/* ------------------------------------------------------------------ */
/* Pure pieces -- exercised by astro-recut-win.test.ts without a       */
/* 300 MB DLL.                                                         */
/* ------------------------------------------------------------------ */

/**
 * The single versioned payload directory inside a Chrome-bin tree
 * (e.g. 151.0.8162.137). Chromium names it after the build; there is exactly
 * one, and everything patchable (chrome.dll, browseros_extensions) lives in it.
 */
export function chromeVersionDir(treeDir: string): string {
  const entries = fs
    .readdirSync(treeDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d+(\.\d+){1,3}$/.test(e.name))
    .map((e) => e.name)
  if (entries.length !== 1) {
    throw new Error(
      `Expected exactly one versioned dir in ${treeDir}, found: ` +
        `${entries.join(', ') || '(none)'}. Is this a Chrome-bin tree?`,
    )
  }
  return path.join(treeDir, entries[0])
}

/**
 * The bundled_extensions.json an Astro Windows tree ships: exactly one entry,
 * the Astro agent, pointing at its CRX and version. Upstream's agent and the
 * bug reporter are gone. Unlike the mac recut's bumpBundledExtension (which
 * edits an entry that already exists), Windows starts from upstream's json and
 * REPLACES it wholesale -- the id we want is not the id that is there.
 */
export function astroBundledManifest(
  crxFileName: string,
  version: string,
): Record<string, Record<string, string>> {
  validateExtensionVersion(version)
  return {
    [ASTRO_EXTENSION_ID]: {
      external_crx: crxFileName,
      external_version: version,
    },
  }
}

/**
 * Apply every url patch to a chrome.dll buffer in place. Returns one row per
 * patch with its occurrence count. Throws if a `required` patch matched zero
 * times -- shipping a DLL that still points at cdn.browseros.com is exactly
 * the failure this script exists to prevent.
 */
export function patchChromeDllUrls(
  buf: Uint8Array,
  opts: { winSparkleFeed?: string } = {},
): BinaryPatch[] {
  const out: BinaryPatch[] = []
  for (const p of WIN_URL_PATCHES) {
    /* With Astro's updater the WinSparkle feed is the build's own URL. */
    const to =
      opts.winSparkleFeed && p.from === UPSTREAM_WINSPARKLE_FEED
        ? opts.winSparkleFeed
        : p.to
    const res = patchAsciiInPlace(buf, p.from, to, { required: false })
    if (p.required && res.occurrences === 0) {
      throw new Error(
        `Required url not found in chrome.dll: "${p.from}" (${p.note}). ` +
          'This is not the prebuilt tree the recut expects.',
      )
    }
    out.push(res)
  }
  /* Not required: the Windows chrome.dll was not checked for the UTF-16
     tooltip yet; the count is logged with the url rows (F-091 c). */
  for (const p of VISIBLE_UTF16_PATCHES) {
    out.push(patchUtf16InPlace(buf, p.from, p.to, { required: false }))
  }
  return out
}

/* ------------------------------------------------------------------ */
/* The re-cut itself                                                   */
/* ------------------------------------------------------------------ */

export type WinRecutOptions = {
  tree: string
  crx: string
  /** Astro's built server resources for windows-x64 (F-051). */
  server: string
  version: string
  /** Astro's release version (0.2.4): Add/Remove Programs, the installer's
      file version and name. Not the CRX version (QA F-014: 0.2.4 showed
      DisplayVersion 0.0.103). */
  appVersion: string
  out: string
  pkg: 'nsis' | 'zip'
  nsi?: string
  makensis?: string
  /** rcedit-x64.exe; without it chrome.exe keeps upstream's version info. */
  rcedit?: string
  /** Astro's update public key (base64). Turns on Astro's own updater:
      key + feed patch, and the Astro-Update package. */
  updateKey?: string
  /** Astro's WinSparkle fork (astro-winsparkle.ts); required with updateKey. */
  winSparkle?: string
  /** The .NET Framework C# compiler for the restart helper (default: Windows' own). */
  csc?: string
  dryRun: boolean
}

/** Windows' own .NET Framework 4 C# compiler (on every Windows 10 and 11). */
export function defaultCsc(): string {
  return path.join(
    process.env.WINDIR ?? 'C:\\Windows',
    'Microsoft.NET',
    'Framework64',
    'v4.0.30319',
    'csc.exe',
  )
}

export function cscArgs(source: string, exe: string): string[] {
  return [
    '/nologo',
    '/target:winexe',
    '/optimize+',
    '/platform:anycpu',
    `/out:${exe}`,
    '/r:System.Management.dll',
    '/r:System.Windows.Forms.dll',
    '/r:System.Drawing.dll',
    source,
  ]
}

/* F-015: Explorer's Properties and Task Manager read these strings from
   chrome.exe and chrome_proxy.exe ("BrowserOS"). rcedit rewrites them. The
   exes then lose upstream's Authenticode signature, like chrome.dll, which
   this re-cut already patches in place; an Astro signature needs Astro's own
   code-signing certificate (FIXES.md, Needs Mann). The version numbers stay
   Chromium's: nothing in the tree reads them, chrome://version shows them. */
export const REBRANDED_EXES = ['chrome.exe', 'chrome_proxy.exe'] as const

export function exeVersionStrings(): Record<string, string> {
  return {
    ProductName: 'Astro',
    FileDescription: 'Astro',
    CompanyName: 'publik',
    LegalCopyright:
      'Copyright (C) The Chromium Authors, (C) 2025 BrowserOS, (C) 2026 publik',
  }
}

export function rceditArgs(
  exe: string,
  strings: Record<string, string>,
): string[] {
  const args = [exe]
  for (const [key, value] of Object.entries(strings)) {
    args.push('--set-version-string', key, value)
  }
  return args
}

const run = (cmd: string, args: string[], cwd?: string) => {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'inherit' })
  if (res.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(' ')} failed (${res.status ?? res.signal})`,
    )
  }
}

export async function recutWin(opts: WinRecutOptions): Promise<string> {
  if (!fs.existsSync(opts.tree)) throw new Error(`Tree not found: ${opts.tree}`)
  if (!fs.existsSync(opts.crx)) throw new Error(`CRX not found: ${opts.crx}`)
  validateExtensionVersion(opts.version)
  checkServerResources(opts.server)
  if (opts.updateKey && !opts.winSparkle) {
    throw new Error(
      '--update-key needs --winsparkle <WinSparkle.dll of Astro\'s fork> (background updates)',
    )
  }
  const forkDll = opts.winSparkle
    ? new Uint8Array(fs.readFileSync(opts.winSparkle))
    : undefined
  if (forkDll) checkWinSparkleDll(forkDll)

  const versionDir = chromeVersionDir(opts.tree)
  const dll = path.join(versionDir, 'chrome.dll')
  const extDir = path.join(versionDir, EXTENSIONS_DIR)
  if (!fs.existsSync(dll)) throw new Error(`chrome.dll not found at ${dll}`)
  if (!fs.existsSync(extDir))
    throw new Error(`${EXTENSIONS_DIR} not found at ${extDir}`)

  console.log(`[1/5] chrome.dll: agent extension id`)
  const fw = new Uint8Array(fs.readFileSync(dll))
  const astroBefore = countAscii(fw, ASTRO_EXTENSION_ID)
  const upstreamBefore = countAscii(fw, UPSTREAM_AGENT_EXTENSION_ID)
  if (astroBefore > 0 && upstreamBefore === 0) {
    console.log(`      already Astro (id x${astroBefore}); leaving id as-is`)
  } else if (upstreamBefore > 0) {
    /* Patch the in-memory buffer unconditionally; only the disk write at the
       end of step [2] is gated on !dryRun. Gating the patch itself made
       --dry-run throw at the post-patch assert (upstream id still present). */
    const patch = patchAsciiInPlace(
      fw,
      UPSTREAM_AGENT_EXTENSION_ID,
      ASTRO_EXTENSION_ID,
    )
    console.log(
      `      ${opts.dryRun ? 'would patch (in-memory)' : 'patched'} upstream id x${patch.occurrences} -> Astro`,
    )
  } else {
    throw new Error(
      'chrome.dll registers neither the upstream nor the Astro agent id. ' +
        'This is not a BrowserOS Windows tree.',
    )
  }

  console.log(`[2/5] chrome.dll: phone-home urls`)
  const winSparkleFeed = opts.updateKey
    ? windowsFeedUrl(opts.appVersion)
    : undefined
  const patches = patchChromeDllUrls(fw, { winSparkleFeed })
  for (const p of patches) {
    console.log(
      `      ${p.occurrences === 0 ? 'skip' : `x${p.occurrences}`}  ${p.from} -> ${p.to}`,
    )
  }
  /* Assert the DLL is clean before we write it back. */
  const astroAfter = countAscii(fw, ASTRO_EXTENSION_ID)
  const upstreamAfter = countAscii(fw, UPSTREAM_AGENT_EXTENSION_ID)
  const cdnAfter = countAscii(fw, 'cdn.browseros.com')
  if (astroAfter < 1 || upstreamAfter > 0) {
    throw new Error(
      `Post-patch chrome.dll has Astro id x${astroAfter}, upstream id x${upstreamAfter}. Aborting.`,
    )
  }
  if (cdnAfter > 0) {
    throw new Error(
      `Post-patch chrome.dll still contains cdn.browseros.com x${cdnAfter}. ` +
        'A phone-home url was missed -- refuse to ship.',
    )
  }
  if (opts.updateKey && winSparkleFeed) {
    const k = patchUpdateKey(fw, opts.updateKey, winSparkleFeed)
    console.log(
      `      WinSparkle update key -> Astro's (at 0x${k.offset.toString(16)}, ${k.distance} bytes from the feed URL; ` +
        `${k.others} other copy of upstream's key left for the server updater)`,
    )
    console.log(`      WinSparkle feed -> ${winSparkleFeed}`)
  }
  if (forkDll) {
    const names = checkWinSparkleLinks(fw, forkDll)
    console.log(
      `      ok: Astro's ${WINSPARKLE_DLL} exports all ${names.length} functions chrome.dll imports`,
    )
  }
  if (!opts.dryRun) fs.writeFileSync(dll, fw)
  console.log(
    `      ok: Astro id x${astroAfter}, upstream id x0, cdn.browseros.com x0`,
  )

  console.log(`[3/5] browseros_extensions: swap CRX + rewrite manifest`)
  const crxName = `${ASTRO_EXTENSION_ID}.crx`
  if (!opts.dryRun) {
    fs.copyFileSync(opts.crx, path.join(extDir, crxName))
    /* Drop upstream's agent CRX and the bug reporter CRX. */
    for (const stale of [
      `${UPSTREAM_AGENT_EXTENSION_ID}.crx`,
      `${BUGREPORTER_EXTENSION_ID}.crx`,
    ]) {
      const p = path.join(extDir, stale)
      if (fs.existsSync(p)) {
        fs.rmSync(p)
        console.log(`      removed ${stale}`)
      }
    }
    const manifest = astroBundledManifest(crxName, opts.version)
    fs.writeFileSync(
      path.join(extDir, BUNDLED_MANIFEST),
      `${JSON.stringify(manifest, null, 2)}\n`,
    )
  }
  console.log(
    `      installed ${crxName} @ ${opts.version}; manifest = Astro only`,
  )

  console.log(`[4/5] assert bug reporter is gone from the tree`)
  if (!opts.dryRun) {
    const leftoverCrx = fs
      .readdirSync(extDir)
      .filter((f) => f.includes(BUGREPORTER_EXTENSION_ID))
    const manifestRaw = fs.readFileSync(
      path.join(extDir, BUNDLED_MANIFEST),
      'utf8',
    )
    if (
      leftoverCrx.length > 0 ||
      manifestRaw.includes(BUGREPORTER_EXTENSION_ID)
    ) {
      throw new Error(
        `Bug reporter still present (files: ${leftoverCrx.join(', ') || 'none'}, ` +
          `in manifest: ${manifestRaw.includes(BUGREPORTER_EXTENSION_ID)}).`,
      )
    }
    console.log('      ok: no adlpneom... crx, not in bundled_extensions.json')
  }

  console.log("[4a/5] local server: install Astro's")
  const serverDir = path.join(versionDir, SERVER_RESOURCES_DIR)
  const serverExe = path.join(serverDir, SERVER_EXE)
  if (!fs.existsSync(serverExe)) {
    throw new Error(
      `The tree has no server at ${serverExe}; refusing to guess where it goes.`,
    )
  }
  if (!opts.dryRun) {
    fs.copyFileSync(path.join(opts.server, SERVER_EXE), serverExe)
    /* Upstream's migrations belong to upstream's schema; the server applies
       every file in this folder at start. */
    const migrations = path.join(serverDir, SERVER_MIGRATIONS)
    fs.rmSync(migrations, { recursive: true, force: true })
    fs.cpSync(path.join(opts.server, SERVER_MIGRATIONS), migrations, {
      recursive: true,
    })
  }
  console.log(`      installed ${SERVER_EXE} and ${SERVER_MIGRATIONS}`)

  console.log('[4b/5] rebrand visible "BrowserOS" text in the paks')
  if (!opts.dryRun) {
    /* The About box, menus, chrome://browseros-onboarding and chrome://version
       text live in <version>/Locales/*.pak and <version>/resources.pak, not in
       chrome.dll. rebrandResourcePaks rewrites "BrowserOS" → "Astro" in decoded
       text entries only and self-tests each pak (aborts loud on failure). */
    const changed = rebrandResourcePaks(versionDir)
    const files = Object.keys(changed)
    const strings = files.reduce((n, f) => n + changed[f], 0)
    console.log(
      `      rebranded ${strings} visible string(s) across ${files.length} pak file(s)`,
    )
  }

  console.log('[4c/5] chrome.exe version info (F-015)')
  if (!opts.rcedit) {
    console.log('      skipped: no --rcedit (needs rcedit-x64.exe)')
  } else if (!opts.dryRun) {
    const onWindows = process.platform === 'win32'
    for (const name of REBRANDED_EXES) {
      const exe = path.join(opts.tree, name)
      if (!fs.existsSync(exe)) {
        console.log(`      ${name}: not in the tree, skipped`)
        continue
      }
      const args = rceditArgs(exe, exeVersionStrings())
      if (onWindows) run(opts.rcedit, args)
      else run('wine', [opts.rcedit, ...args])
      console.log(`      ${name}: ProductName/FileDescription = Astro`)
    }
  }

  if (forkDll) {
    console.log("[4d/5] WinSparkle: Astro's fork + WinSparkle.ini")
    const target = path.join(versionDir, WINSPARKLE_DLL)
    if (!fs.existsSync(target)) {
      throw new Error(`The tree has no ${target}; refusing to guess where it goes.`)
    }
    if (!opts.dryRun) {
      fs.writeFileSync(target, forkDll)
      fs.writeFileSync(
        path.join(versionDir, WINSPARKLE_INI),
        winSparkleIni(opts.appVersion),
      )
    }
    console.log(
      `      installed the pinned ${WINSPARKLE_DLL}; ${WINSPARKLE_INI}: silent, BuildVersion for ${opts.appVersion}`,
    )
  }

  console.log(`[5/5] package: ${opts.pkg}`)
  fs.mkdirSync(opts.out, { recursive: true })
  if (opts.pkg === 'zip') {
    const zip = path.join(path.resolve(opts.out), 'Astro-win64.zip')
    if (!opts.dryRun) {
      /* PowerShell is always present on windows-latest. */
      run('powershell', [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path '${path.resolve(opts.tree)}\\*' -DestinationPath '${zip}' -Force`,
      ])
    }
    console.log(`      wrote ${zip}`)
    return zip
  }

  const nsi =
    opts.nsi ??
    path.join(path.dirname(new URL(import.meta.url).pathname), 'astro-win.nsi')
  const makensis = opts.makensis ?? 'makensis'
  /* The restart helper (astro-win.nsi installs it outside Application\). */
  const helperExe = path.join(path.resolve(opts.out), RESTART_HELPER_EXE)
  if (!opts.dryRun) {
    run(
      opts.csc ?? defaultCsc(),
      cscArgs(
        path.join(path.dirname(path.resolve(nsi)), RESTART_HELPER_SOURCE),
        helperExe,
      ),
    )
  }
  console.log(`      compiled ${helperExe}`)
  const nsisHelpers = [
    `/DHELPER=${path.join(path.dirname(path.resolve(nsi)), 'astro-update-helper.ps1')}`,
    `/DRESTART=${helperExe}`,
  ]
  const outFile = path.join(
    path.resolve(opts.out),
    `Astro-Setup-${opts.appVersion}.exe`,
  )
  if (!opts.dryRun) {
    run(makensis, [
      `/DSRCDIR=${path.resolve(opts.tree)}`,
      `/DOUTFILE=${outFile}`,
      `/DVERSION=${opts.appVersion}`,
      ...nsisHelpers,
      path.resolve(nsi),
    ])
  }
  console.log(`      wrote ${outFile}`)
  if (opts.updateKey) {
    /* The update package: same tree, run by WinSparkle (see astro-win.nsi). */
    const updateFile = path.join(
      path.resolve(opts.out),
      `Astro-Update-${opts.appVersion}.exe`,
    )
    if (!opts.dryRun) {
      run(makensis, [
        '/DUPDATER',
        `/DSRCDIR=${path.resolve(opts.tree)}`,
        `/DOUTFILE=${updateFile}`,
        `/DVERSION=${opts.appVersion}`,
        ...nsisHelpers,
        path.resolve(nsi),
      ])
    }
    console.log(`      wrote ${updateFile}`)
  }
  return outFile
}

/* ------------------------------------------------------------------ */

/** NSIS VIProductVersion takes x.y.z(.w); the release tag without its `v`. */
export function validateAppVersion(version: string): string {
  const v = version.replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+$/.test(v)) {
    throw new Error(
      `--app-version must be x.y.z (e.g. 0.2.4), got "${version}"`,
    )
  }
  return v
}

export function parseArgs(argv: string[]): WinRecutOptions {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const tree = get('--tree')
  const crx = get('--crx')
  const server = get('--server')
  const version = get('--version')
  const appVersion = get('--app-version')
  if (!tree || !crx || !server || !version || !appVersion) {
    throw new Error(
      'Usage: bun astro-recut-win.ts --tree <Chrome-bin> --crx <file.crx> ' +
        '--server <windows-x64 server resources dir> ' +
        '--version <CRX version, 0.0.101> --app-version <Astro release, 0.2.4> ' +
        '[--out dir] [--package nsis|zip] [--nsi <.nsi>] ' +
        '[--makensis <path>] [--rcedit <rcedit-x64.exe>] [--update-key <base64> --winsparkle <WinSparkle.dll>] ' +
        '[--csc <csc.exe>] [--dry-run]',
    )
  }
  const pkg = (get('--package') ?? 'nsis') as 'nsis' | 'zip'
  if (pkg !== 'nsis' && pkg !== 'zip') {
    throw new Error(`--package must be "nsis" or "zip", got "${pkg}"`)
  }
  return {
    tree,
    crx,
    server,
    version: validateExtensionVersion(version),
    appVersion: validateAppVersion(appVersion),
    out: get('--out') ?? 'dist/win',
    pkg,
    nsi: get('--nsi'),
    makensis: get('--makensis'),
    rcedit: get('--rcedit'),
    updateKey: get('--update-key')
      ? validatePublicKey(get('--update-key') as string)
      : undefined,
    winSparkle: get('--winsparkle'),
    csc: get('--csc'),
    dryRun: argv.includes('--dry-run'),
  }
}

if (import.meta.main) {
  try {
    await recutWin(parseArgs(process.argv.slice(2)))
  } catch (err) {
    console.error(`astro-recut-win: ${(err as Error).message}`)
    process.exit(1)
  }
}
