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
 *     --version 0.0.101 \
 *     --out   dist\win \
 *     [--package nsis|zip] [--nsi <astro-win.nsi>] [--makensis <makensis.exe>] \
 *     [--dry-run]
 */
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

import {
  ASTRO_EXTENSION_ID,
  type BinaryPatch,
  countAscii,
  patchAsciiInPlace,
  UPSTREAM_AGENT_EXTENSION_ID,
  validateExtensionVersion,
} from './astro-recut'

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
export function patchChromeDllUrls(buf: Uint8Array): BinaryPatch[] {
  const out: BinaryPatch[] = []
  for (const p of WIN_URL_PATCHES) {
    const res = patchAsciiInPlace(buf, p.from, p.to, { required: false })
    if (p.required && res.occurrences === 0) {
      throw new Error(
        `Required url not found in chrome.dll: "${p.from}" (${p.note}). ` +
          'This is not the prebuilt tree the recut expects.',
      )
    }
    out.push(res)
  }
  return out
}

/* ------------------------------------------------------------------ */
/* The re-cut itself                                                   */
/* ------------------------------------------------------------------ */

export type WinRecutOptions = {
  tree: string
  crx: string
  version: string
  out: string
  pkg: 'nsis' | 'zip'
  nsi?: string
  makensis?: string
  dryRun: boolean
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
  const patches = patchChromeDllUrls(fw)
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
  const outFile = path.join(
    path.resolve(opts.out),
    `Astro-Setup-${opts.version}.exe`,
  )
  if (!opts.dryRun) {
    run(makensis, [
      `/DSRCDIR=${path.resolve(opts.tree)}`,
      `/DOUTFILE=${outFile}`,
      `/DVERSION=${opts.version}`,
      path.resolve(nsi),
    ])
  }
  console.log(`      wrote ${outFile}`)
  return outFile
}

/* ------------------------------------------------------------------ */

export function parseArgs(argv: string[]): WinRecutOptions {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const tree = get('--tree')
  const crx = get('--crx')
  const version = get('--version')
  if (!tree || !crx || !version) {
    throw new Error(
      'Usage: bun astro-recut-win.ts --tree <Chrome-bin> --crx <file.crx> ' +
        '--version <0.0.101> [--out dir] [--package nsis|zip] [--nsi <.nsi>] ' +
        '[--makensis <path>] [--dry-run]',
    )
  }
  const pkg = (get('--package') ?? 'nsis') as 'nsis' | 'zip'
  if (pkg !== 'nsis' && pkg !== 'zip') {
    throw new Error(`--package must be "nsis" or "zip", got "${pkg}"`)
  }
  return {
    tree,
    crx,
    version: validateExtensionVersion(version),
    out: get('--out') ?? 'dist/win',
    pkg,
    nsi: get('--nsi'),
    makensis: get('--makensis'),
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
