/**
 * @license
 * Copyright 2026 publik
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Re-cut Astro.app around a freshly built agent extension.
 *
 * Astro is not a Chromium build. The shipped bundle is upstream's prebuilt
 * BrowserOS with three edits (R29 §1.1): the agent extension id inside
 * `BrowserOS Framework` byte-patched from upstream's to Astro's, Astro's own
 * CRX dropped into `Resources/browseros_extensions/` next to a rewritten
 * `bundled_extensions.json`, and the whole bundle re-signed with publik's
 * Developer ID. A branded Chromium needs ~100 GB per platform and cannot be
 * cross-compiled, so every extension release is this recipe with a new CRX
 * and a version bump — route A in R29 §1.3, adopted by D33.
 *
 * Until now the recipe lived in the session that made v0.1.0 and nowhere
 * else (R29 §7.1). This is that recipe, executable and asserted.
 *
 * It also closes the Sparkle trap (R29 finding 5): the shipped bundle still
 * carries `SUEnableAutomaticChecks = 1`, upstream's `SUPublicEDKey` and
 * `https://cdn.browseros.com/appcast`, so every install is one silent update
 * away from becoming stock BrowserOS — which unregisters Astro's extension
 * id and deletes the agent. `--sparkle disable` (the default) turns the
 * automatic checks off AND repoints the feed string, so a manual "Check for
 * Updates" cannot reach upstream either.
 *
 * What this script does NOT do: notarize, staple, or build the dmg. Those
 * need the founder's Apple credentials and are written out as the exact
 * commands to run — see RELEASING.md (repo root).
 *
 * Usage:
 *   bun scripts/release/astro-recut.ts \
 *     --source ~/Downloads/Astro.app \
 *     --crx dist/astro-agent-0.0.101.crx \
 *     --out dist/astro-recut \
 *     [--sparkle disable|keep] [--sparkle-feed <url, same length>] \
 *     [--sparkle-ed-key <base64>] [--patch-id] [--sign] [--dry-run]
 */
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { rebrandResourcePaks } from './pak-rebrand'

/* Astro's extension id: the fork packs the agent with its own key
   (8b92acb0e), so the id differs from upstream's and the framework has to
   be told about it. Both are 32 characters, which is what makes the patch
   length-preserving. */
export const ASTRO_EXTENSION_ID = 'kofbmbngmnnpmopgbhpbajhnnnoflolg'
export const UPSTREAM_AGENT_EXTENSION_ID = 'bflpfmnmnokmjhmgnolecpppdbdophmk'

/* The Sparkle feed compiled into upstream's framework, and publik's
   replacement. Both are 33 bytes: a string inside a signed Mach-O binary
   can be overwritten but not resized. */
export const UPSTREAM_APPCAST_URL = 'https://cdn.browseros.com/appcast'
export const PUBLIK_APPCAST_URL = 'https://publikhq.com/astro/update'

/* Upstream's bug reporter. Dropped from every re-cut: publik does not run the
   BrowserOS bug service, and a bundled reporter that phones browseros.com is
   one of the loudest BrowserOS tells left in the app. The compiled-in table
   kBrowserOSExtensions still pins it (product = kAll) and the extension
   maintainer re-installs anything the remote config lists, so removing the CRX
   is durable only together with the phone-home patches below. */
export const BUG_REPORTER_EXTENSION_ID = 'adlpneommgkgeanpaekgoaolcpncohkf'

/**
 * The browseros.com hosts the extension maintainer and the server updater
 * phone home to, and the same-length swaps that neutralise them.
 *
 * The extension maintainer (browseros_extension_maintainer.cc) polls
 * `kBrowserOSConfigUrl` (the extensions config) every cycle and installs
 * whatever the remote config lists — so a bundle that can still reach it will
 * re-add the bug reporter this recipe just dropped. The config and the update
 * manifest are pointed at a guaranteed-dead host: `.invalid` is reserved by
 * RFC 6761 and never resolves (Chromium itself uses `*.invalid` throughout).
 * The server OTA channel is publik's to run, so it is repointed to publik
 * rather than killed — this is what v0.1.1 shipped.
 *
 * Each `to` is the exact byte length of its `from`: a string inside the signed
 * Mach-O can be overwritten but not resized. Asserted in the tests.
 */
export const PHONE_HOME_PATCHES: readonly { from: string; to: string }[] = [
  {
    from: 'https://cdn.browseros.com/extensions/extensions.json',
    to: 'https://cdn.astro.invalid/extensions/extensions.json',
  },
  {
    from: 'https://cdn.browseros.com/extensions/extensions.alpha.json',
    to: 'https://cdn.astro.invalid/extensions/extensions.alpha.json',
  },
  {
    from: 'https://cdn.browseros.com/extensions/update-manifest.xml',
    to: 'https://cdn.astro.invalid/extensions/update-manifest.xml',
  },
  {
    from: 'https://cdn.browseros.com/extensions/update-manifest.alpha.xml',
    to: 'https://cdn.astro.invalid/extensions/update-manifest.alpha.xml',
  },
  {
    from: 'https://cdn.browseros.com/appcast-server.xml',
    to: 'https://publikhq.com/astro/update-server.xml',
  },
  {
    from: 'https://cdn.browseros.com/appcast-server.alpha.xml',
    to: 'https://publikhq.com/astro/update-server.alpha.xml',
  },
]

/**
 * Same-length swaps for user-visible BrowserOS strings baked into the
 * framework binary (About box, version credits, copyright). Empty until the
 * visible-string audit hands over verified pairs, and deliberately so: the
 * bundle-visible name is already carried by Info.plist
 * (CFBundleDisplayName / CFBundleName = "Astro"); the bare "BrowserOS" tokens
 * in this binary are load-bearing identifiers (pref keys `browseros.*`, the
 * `BrowserOS Framework` / `BrowserOS Helper` load paths, the
 * `BrowserOS Safe Storage` Keychain label — renaming any of them orphans user
 * data); and Chromium's product name for the About UI lives in the `.pak`
 * resources, not here. Each pair added is applied fail-loud (occurrences > 0)
 * during the re-cut and must be equal length; both are asserted.
 */
export const VISIBLE_STRING_PATCHES: readonly { from: string; to: string }[] =
  []

export const DEVELOPER_ID =
  'Developer ID Application: Mann Bellani (R5R3ZS54LV)'
/* `xcrun notarytool store-credentials AC_PASSWORD` — the profile the other
   publik Mac apps already use (session note `publik-desktop-signing`). */
export const NOTARY_PROFILE = 'AC_PASSWORD'

const FRAMEWORK_GLOB = 'Contents/Frameworks/BrowserOS Framework.framework'
const EXTENSIONS_DIR = 'Resources/browseros_extensions'
const BUNDLED_MANIFEST = 'bundled_extensions.json'

/* ------------------------------------------------------------------ */
/* Pure pieces — everything below this line is exercised by            */
/* astro-recut.test.ts without a 240 MB bundle.                        */
/* ------------------------------------------------------------------ */

/** Chrome accepts 1–4 dot-separated integers and nothing else (release.py:32). */
export function validateExtensionVersion(version: string): string {
  if (!/^\d+(\.\d+){0,3}$/.test(version)) {
    throw new Error(
      `Extension version must be 1–4 dot-separated integers, got "${version}"`,
    )
  }
  return version
}

/**
 * Where the zip starts inside a CRX3: `Cr24` magic, u32 format version, u32
 * header length, then the protobuf header.
 */
export function crxZipOffset(buf: Uint8Array): number {
  if (buf.byteLength < 12) throw new Error('Not a CRX file (too short)')
  const magic = new TextDecoder().decode(buf.subarray(0, 4))
  if (magic !== 'Cr24') throw new Error(`Not a CRX file (magic "${magic}")`)
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const format = view.getUint32(4, true)
  if (format !== 3) throw new Error(`Unsupported CRX format version ${format}`)
  const headerSize = view.getUint32(8, true)
  const offset = 12 + headerSize
  if (offset >= buf.byteLength) throw new Error('CRX header runs past EOF')
  return offset
}

/**
 * Rewrite one entry of Chromium's external-extensions manifest — the file
 * that makes the browser install the bundled CRX, and whose `external_version`
 * being newer than the installed one is what triggers the upgrade on launch
 * (browseros_extension_loader.h:68-71). Every other entry (upstream's bug
 * reporter) is left exactly as it was.
 */
export function bumpBundledExtension(
  manifest: unknown,
  opts: { extensionId: string; crxFileName: string; version: string },
): Record<string, Record<string, unknown>> {
  validateExtensionVersion(opts.version)
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`${BUNDLED_MANIFEST} is not a JSON object`)
  }
  const out = { ...(manifest as Record<string, Record<string, unknown>>) }
  const existing = out[opts.extensionId]
  if (!existing || typeof existing !== 'object') {
    throw new Error(
      `${BUNDLED_MANIFEST} has no entry for ${opts.extensionId} — this bundle ` +
        'was not cut from an Astro release. Patch the framework id first.',
    )
  }
  out[opts.extensionId] = {
    ...existing,
    external_crx: opts.crxFileName,
    external_version: opts.version,
  }
  return out
}

/**
 * Remove one entry from the external-extensions manifest, returning the new
 * manifest and the CRX file the entry named so the caller can delete it from
 * disk. Fails loud when the entry is absent: a re-cut that "dropped" an
 * extension that was never there has silently shipped it.
 */
export function dropBundledExtension(
  manifest: unknown,
  extensionId: string,
): { manifest: Record<string, Record<string, unknown>>; crxFileName?: string } {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`${BUNDLED_MANIFEST} is not a JSON object`)
  }
  const out = { ...(manifest as Record<string, Record<string, unknown>>) }
  const existing = out[extensionId]
  if (!existing || typeof existing !== 'object') {
    throw new Error(
      `${BUNDLED_MANIFEST} has no entry for ${extensionId} — refusing to ` +
        'report a drop that did nothing.',
    )
  }
  const crxFileName =
    typeof existing.external_crx === 'string'
      ? (existing.external_crx as string)
      : undefined
  delete out[extensionId]
  return { manifest: out, crxFileName }
}

export type BinaryPatch = { from: string; to: string; occurrences: number }

/**
 * Overwrite an ASCII string inside a binary in place. Same length only: the
 * Mach-O's load commands and every offset after the string assume it.
 * Zero occurrences is an error — silently shipping an unpatched binary is
 * exactly the failure this script exists to prevent.
 */
export function patchAsciiInPlace(
  buf: Uint8Array,
  from: string,
  to: string,
  opts: { required?: boolean } = {},
): BinaryPatch {
  if (from.length !== to.length) {
    throw new Error(
      `Replacement must be the same length: "${from}" is ${from.length} bytes, ` +
        `"${to}" is ${to.length}`,
    )
  }
  const fromBytes = new TextEncoder().encode(from)
  const toBytes = new TextEncoder().encode(to)
  if (fromBytes.length !== toBytes.length) {
    throw new Error('Replacement must be the same length in bytes (ASCII only)')
  }
  let occurrences = 0
  outer: for (let i = 0; i + fromBytes.length <= buf.length; i++) {
    for (let j = 0; j < fromBytes.length; j++) {
      if (buf[i + j] !== fromBytes[j]) continue outer
    }
    buf.set(toBytes, i)
    occurrences++
    i += fromBytes.length - 1
  }
  if (occurrences === 0 && opts.required !== false) {
    throw new Error(`String not found in binary: "${from}"`)
  }
  return { from, to, occurrences }
}

export function countAscii(buf: Uint8Array, needle: string): number {
  const bytes = new TextEncoder().encode(needle)
  let n = 0
  outer: for (let i = 0; i + bytes.length <= buf.length; i++) {
    for (let j = 0; j < bytes.length; j++) {
      if (buf[i + j] !== bytes[j]) continue outer
    }
    n++
    i += bytes.length - 1
  }
  return n
}

/**
 * Apply the phone-home swaps to a framework buffer in place.
 *
 * Robust to a source that is a previous Astro.app, not only stock upstream
 * (RELEASING.md: the source may be either): a `from` that is already gone is
 * not an error. The fail-loud is the invariant that actually matters — after
 * the pass NO browseros.com maintainer or OTA URL may survive, which also
 * catches a source variant whose exact URL we did not know to patch. Returns
 * the per-pair occurrence counts for logging.
 */
export function applyPhoneHomePatches(
  buf: Uint8Array,
  patches: readonly { from: string; to: string }[] = PHONE_HOME_PATCHES,
): BinaryPatch[] {
  const applied = patches.map((p) =>
    patchAsciiInPlace(buf, p.from, p.to, { required: false }),
  )
  for (const marker of [
    'cdn.browseros.com/extensions/',
    'cdn.browseros.com/appcast-server',
  ]) {
    if (countAscii(buf, marker) > 0) {
      throw new Error(
        `A browseros.com phone-home URL survived the re-cut (${marker}…). ` +
          'The extension maintainer could still reach browseros.com and ' +
          're-add the bug reporter — patch the new URL before shipping.',
      )
    }
  }
  return applied
}

export type PlistOp = {
  key: string
  type: 'bool' | 'integer' | 'string'
  value: string
}

/**
 * The Sparkle keys to write into Info.plist.
 *
 * `disable` is D33's minimum: automatic checks off, the scheduled interval
 * cleared, and — because "Check for Updates…" in the menu ignores those —
 * the feed URL overridden with `SUFeedURL`, which Sparkle prefers over the
 * compiled-in default. The framework string is repointed separately so even
 * a Sparkle that ignores the plist cannot reach upstream.
 *
 * An EdDSA public key is only written when the integrator passes one: until
 * publik holds the private half, hosting an appcast is pointless, and
 * leaving upstream's key in place with the feed repointed means an upstream
 * update can never be validated — which is the safe direction.
 */
export function sparklePlistOps(opts: {
  mode: 'disable' | 'keep'
  feedUrl?: string
  edKey?: string
}): PlistOp[] {
  if (opts.mode === 'keep') return []
  const ops: PlistOp[] = [
    { key: 'SUEnableAutomaticChecks', type: 'bool', value: 'NO' },
    { key: 'SUAutomaticallyUpdate', type: 'bool', value: 'NO' },
    { key: 'SUScheduledCheckInterval', type: 'integer', value: '0' },
    {
      key: 'SUFeedURL',
      type: 'string',
      value: opts.feedUrl ?? PUBLIK_APPCAST_URL,
    },
  ]
  if (opts.edKey) {
    ops.push({ key: 'SUPublicEDKey', type: 'string', value: opts.edKey })
  }
  return ops
}

/** `plutil -replace <key> -<type> <value> <plist>`, one per op. */
export function plutilArgs(plistPath: string, op: PlistOp): string[] {
  return ['-replace', op.key, `-${op.type}`, op.value, plistPath]
}

/**
 * Sign inside-out: nested code before the code that contains it, or the
 * outer signature seals a bundle whose contents change underneath it.
 *
 * `--entitlements` is not optional in practice — see `readEntitlements`.
 * It is optional here only so a target that genuinely carries none signs
 * without an empty plist.
 */
export function codesignArgs(
  target: string,
  identity: string,
  entitlements?: string,
): string[] {
  return [
    '--force',
    '--timestamp',
    '--options',
    'runtime',
    ...(entitlements ? ['--entitlements', entitlements] : []),
    '--sign',
    identity,
    target,
  ]
}

/**
 * The entitlements a path carries in the bundle we copied from, as the XML
 * plist `codesign --entitlements` wants back.
 *
 * `codesign --sign` writes the entitlements it is given and **no others**:
 * re-signing without `--entitlements` silently produces a binary with an
 * empty entitlement set. Under `--options runtime` that is fatal for a
 * Chromium. The shipped v0.1.0 browser carries seven
 * (`cs.allow-jit`, `cs.allow-unsigned-executable-memory`,
 * `cs.disable-library-validation`, `cs.allow-dyld-environment-variables`,
 * `device.camera`, `device.audio-input`, `personal-information.location`)
 * and each helper four; without `allow-jit` V8 dies on its first code
 * allocation and without `disable-library-validation` the app cannot even
 * load its own framework. Nothing in `spctl`, `stapler` or notarization
 * catches this — an entitlement-stripped bundle notarizes happily and then
 * fails to launch, which is why the re-cut carries them across explicitly
 * and asserts afterwards that it did.
 *
 * Returns undefined when the target has no entitlements (or is not signed).
 */
export function readEntitlements(target: string): string | undefined {
  const res = spawnSync(
    'codesign',
    ['-d', '--entitlements', '-', '--xml', target],
    { encoding: 'utf8' },
  )
  const out = res.stdout?.trim()
  if (!out || !out.startsWith('<?xml')) return undefined
  return out
}

/** The entitlement keys in a `codesign --xml` dump, sorted, for comparison. */
export function entitlementKeys(xml: string | undefined): string[] {
  if (!xml) return []
  return [...xml.matchAll(/<key>([^<]+)<\/key>/g)].map((m) => m[1]).sort()
}

export function notarizeCommands(dmgPath: string): string[] {
  return [
    `xcrun notarytool submit "${dmgPath}" --keychain-profile ${NOTARY_PROFILE} --wait`,
    `xcrun stapler staple "${dmgPath}"`,
  ]
}

/* ------------------------------------------------------------------ */
/* The re-cut itself                                                   */
/* ------------------------------------------------------------------ */

export type RecutOptions = {
  source: string
  crx: string
  out: string
  version?: string
  sparkle: 'disable' | 'keep'
  sparkleFeed?: string
  sparkleEdKey?: string
  sign: boolean
  patchId: boolean
  identity: string
  dryRun: boolean
}

const run = (cmd: string, args: string[], cwd?: string) => {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf8' })
  if (res.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(' ')} failed (${res.status}): ${res.stderr || res.stdout}`,
    )
  }
  return res.stdout
}

/** Reads the packed CRX's own manifest so `external_version` cannot drift. */
export function crxManifestVersion(crxPath: string): string {
  const buf = new Uint8Array(fs.readFileSync(crxPath))
  const offset = crxZipOffset(buf)
  const tmp = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astro-crx-')),
    'ext.zip',
  )
  fs.writeFileSync(tmp, buf.subarray(offset))
  try {
    const raw = run('unzip', ['-p', tmp, 'manifest.json'])
    const manifest = JSON.parse(raw) as { version?: string }
    if (!manifest.version) throw new Error('CRX manifest has no version')
    return validateExtensionVersion(manifest.version)
  } finally {
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true })
  }
}

/** The single versioned framework directory inside the bundle. */
export function frameworkVersionDir(appPath: string): string {
  const versions = path.join(appPath, FRAMEWORK_GLOB, 'Versions')
  const entries = fs
    .readdirSync(versions)
    .filter((e) => e !== 'Current' && !e.startsWith('.'))
  const [only] = entries
  if (entries.length !== 1 || !only) {
    throw new Error(
      `Expected exactly one framework version in ${versions}, found: ${entries.join(', ') || '(none)'}`,
    )
  }
  return path.join(versions, only)
}

export async function recut(opts: RecutOptions): Promise<string> {
  if (process.platform !== 'darwin') {
    throw new Error('The re-cut runs on macOS: it needs plutil and codesign.')
  }
  if (!fs.existsSync(opts.source)) {
    throw new Error(`Source bundle not found: ${opts.source}`)
  }
  if (!fs.existsSync(opts.crx)) throw new Error(`CRX not found: ${opts.crx}`)

  /* The CRX's own manifest is the authority: `external_version` that
     disagrees with it either never upgrades or upgrades forever. */
  const crxVersion = crxManifestVersion(opts.crx)
  if (opts.version && validateExtensionVersion(opts.version) !== crxVersion) {
    throw new Error(
      `--version ${opts.version} does not match the CRX's own manifest version ${crxVersion}`,
    )
  }
  const version = crxVersion

  fs.mkdirSync(opts.out, { recursive: true })
  const appOut = path.join(opts.out, 'Astro.app')
  if (fs.existsSync(appOut)) fs.rmSync(appOut, { recursive: true, force: true })

  console.log(`[1/7] Copying ${opts.source} → ${appOut}`)
  /* ditto, not cp: it preserves extended attributes, symlinks and the
     resource forks a signed bundle depends on. */
  if (!opts.dryRun) run('ditto', [opts.source, appOut])

  const versionDir = opts.dryRun ? '' : frameworkVersionDir(appOut)
  const frameworkBinary = path.join(versionDir, 'BrowserOS Framework')
  const extDir = path.join(versionDir, EXTENSIONS_DIR)

  console.log('[2/7] Framework extension id')
  if (!opts.dryRun) {
    const fw = new Uint8Array(fs.readFileSync(frameworkBinary))
    let astro = countAscii(fw, ASTRO_EXTENSION_ID)
    let upstream = countAscii(fw, UPSTREAM_AGENT_EXTENSION_ID)
    if (upstream > 0 && opts.patchId) {
      /* Starting from a stock upstream bundle (a Chromium version bump).
         `IsActiveBrowserOSExtension` walks a compiled-in table, so the
         only way to register Astro's id is to overwrite upstream's — both
         are 32 characters, which is what makes it possible (R29 §1.2). */
      const patch = patchAsciiInPlace(
        fw,
        UPSTREAM_AGENT_EXTENSION_ID,
        ASTRO_EXTENSION_ID,
      )
      fs.writeFileSync(frameworkBinary, fw)
      astro += patch.occurrences
      upstream = 0
      console.log(`      patched upstream id ×${patch.occurrences} → Astro`)
    }
    if (astro < 1 || upstream > 0) {
      throw new Error(
        `This framework registers ${upstream} upstream id(s) and ${astro} Astro id(s). ` +
          'A stock BrowserOS bundle has to be id-patched before it can carry ' +
          "Astro's extension — the installer skips every id that is not in " +
          'kBrowserOSExtensions. Re-run with --patch-id.',
      )
    }
    console.log(`      ok: Astro id ×${astro}, upstream id ×${upstream}`)
  }

  console.log(
    `[3/7] Installing the CRX as ${ASTRO_EXTENSION_ID}.crx @ ${version}; ` +
      `dropping the bug reporter ${BUG_REPORTER_EXTENSION_ID}`,
  )
  if (!opts.dryRun) {
    const crxName = `${ASTRO_EXTENSION_ID}.crx`
    fs.copyFileSync(opts.crx, path.join(extDir, crxName))
    const manifestPath = path.join(extDir, BUNDLED_MANIFEST)
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    /* From a stock upstream bundle (the --patch-id path), the manifest still
       keys the UPSTREAM agent id, not Astro's — the same rename the framework
       byte-patch just did in step [2]. Move that entry onto the Astro id and
       delete the orphaned upstream CRX, so the bump below finds an Astro entry
       to update. A re-cut from a previous Astro bundle already has the Astro
       key, so this is a no-op there. */
    if (
      manifest &&
      typeof manifest === 'object' &&
      !manifest[ASTRO_EXTENSION_ID] &&
      manifest[UPSTREAM_AGENT_EXTENSION_ID]
    ) {
      manifest[ASTRO_EXTENSION_ID] = manifest[UPSTREAM_AGENT_EXTENSION_ID]
      delete manifest[UPSTREAM_AGENT_EXTENSION_ID]
      const staleCrx = path.join(extDir, `${UPSTREAM_AGENT_EXTENSION_ID}.crx`)
      if (fs.existsSync(staleCrx)) fs.rmSync(staleCrx)
      console.log(
        `      renamed the bundled manifest's agent entry ${UPSTREAM_AGENT_EXTENSION_ID} → ${ASTRO_EXTENSION_ID}`,
      )
    }
    const bumped = bumpBundledExtension(manifest, {
      extensionId: ASTRO_EXTENSION_ID,
      crxFileName: crxName,
      version,
    })
    /* Drop upstream's bug reporter: entry out of the manifest, CRX off disk.
       Fails loud if it was not there — a re-cut that dropped nothing is a bug.
       Durable only with the phone-home patches in step [4]. */
    const { manifest: next, crxFileName } = dropBundledExtension(
      bumped,
      BUG_REPORTER_EXTENSION_ID,
    )
    fs.writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`)
    const droppedCrx = crxFileName ?? `${BUG_REPORTER_EXTENSION_ID}.crx`
    const crxPath = path.join(extDir, droppedCrx)
    if (!fs.existsSync(crxPath)) {
      throw new Error(
        `Bug reporter CRX not found to delete: ${crxPath}. The manifest ` +
          'listed it but the file is missing — refusing to ship a ' +
          'half-dropped extension.',
      )
    }
    fs.rmSync(crxPath)
    const remaining = Object.keys(next)
    if (remaining.length !== 1 || remaining[0] !== ASTRO_EXTENSION_ID) {
      throw new Error(
        'bundled_extensions.json must list only the Astro agent after the ' +
          `drop, but lists: ${remaining.join(', ') || '(none)'}`,
      )
    }
    console.log(
      `      dropped ${droppedCrx}; bundled_extensions.json now lists only ` +
        ASTRO_EXTENSION_ID,
    )
  }

  console.log('[4/7] Neutralizing browseros.com phone-home URLs')
  if (!opts.dryRun) {
    /* The extension maintainer polls the config URL and reinstalls anything it
       lists, so dropping the bug reporter above only sticks once the framework
       can no longer reach browseros.com. Visible-string swaps (empty until the
       audit lands) ride the same buffer read/write. */
    const fw = new Uint8Array(fs.readFileSync(frameworkBinary))
    const applied = applyPhoneHomePatches(fw)
    for (const p of VISIBLE_STRING_PATCHES) {
      const r = patchAsciiInPlace(fw, p.from, p.to)
      console.log(`      visible "${p.from}" → "${p.to}" ×${r.occurrences}`)
    }
    fs.writeFileSync(frameworkBinary, fw)
    const total = applied.reduce((n, p) => n + p.occurrences, 0)
    console.log(
      `      repointed ${total} phone-home string(s) off browseros.com ` +
        '(config + update-manifest → dead host; server OTA → publik)',
    )
  }

  console.log('[4b/7] Rebranding visible "BrowserOS" text in the paks')
  if (!opts.dryRun) {
    /* The About box, app menus, chrome://browseros-onboarding and the
       chrome://version fragment are not in the Mach-O — they are DataPack
       entries in Resources/*.lproj/locale.pak and Resources/resources.pak.
       rebrandResourcePaks rewrites "BrowserOS" → "Astro" inside decoded text
       entries only, rebuilds each index, and self-tests every pak (aborts
       loud on any structural or residual-brand failure). Verified end-to-end:
       the rebuilt browser launches and reads "Astro Onboarding" where the base
       read "BrowserOS Onboarding". */
    const resourcesDir = path.join(versionDir, 'Resources')
    const changed = rebrandResourcePaks(resourcesDir)
    const files = Object.keys(changed)
    const strings = files.reduce((n, f) => n + changed[f], 0)
    console.log(
      `      rebranded ${strings} visible string(s) across ${files.length} pak file(s)`,
    )
  }

  console.log('[4c/7] App display name → Astro')
  if (!opts.dryRun) {
    /* CFBundleName / CFBundleDisplayName drive the Finder name, the Dock label
       and the app menu title ("Astro" / "About Astro" / "Quit Astro"). A
       re-cut from a prior Astro bundle already carries these; a stock upstream
       source reads "BrowserOS", so set them. CFBundleExecutable stays
       "BrowserOS" (the binary path) and CFBundleIdentifier stays
       com.browseros.BrowserOS (changing it orphans the profile). */
    const infoPlist = path.join(appOut, 'Contents/Info.plist')
    for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
      run('plutil', ['-replace', key, '-string', 'Astro', infoPlist])
    }
    console.log('      CFBundleName / CFBundleDisplayName = Astro')
  }

  console.log(`[5/7] Sparkle: ${opts.sparkle}`)
  if (opts.sparkle === 'disable' && !opts.dryRun) {
    const feed = opts.sparkleFeed ?? PUBLIK_APPCAST_URL
    const infoPlist = path.join(appOut, 'Contents/Info.plist')
    for (const op of sparklePlistOps({
      mode: 'disable',
      feedUrl: feed,
      edKey: opts.sparkleEdKey,
    })) {
      run('plutil', plutilArgs(infoPlist, op))
    }
    /* The compiled-in default, for a Sparkle that never reads SUFeedURL.
       Same length or the binary moves. required:false because a re-cut from a
       previous Astro bundle already carries the publik feed here — that is not
       an error, but the framework must end up pointing at `feed` either way. */
    const fw = new Uint8Array(fs.readFileSync(frameworkBinary))
    const patch = patchAsciiInPlace(fw, UPSTREAM_APPCAST_URL, feed, {
      required: false,
    })
    if (patch.occurrences === 0 && countAscii(fw, feed) === 0) {
      throw new Error(
        `Sparkle appcast: neither "${UPSTREAM_APPCAST_URL}" nor "${feed}" is in ` +
          'the framework — the compiled-in feed is something unexpected. Refusing ' +
          'to ship a bundle whose update feed is unknown.',
      )
    }
    fs.writeFileSync(frameworkBinary, fw)
    console.log(
      `      appcast repointed ×${patch.occurrences} → ${feed}; automatic checks off`,
    )
    if (!opts.sparkleEdKey) {
      console.log(
        '      note: SUPublicEDKey is still upstream’s, so nothing served at ' +
          'the new feed can validate. That is the safe direction until publik ' +
          'holds an EdDSA key; pass --sparkle-ed-key to turn this into a real ' +
          'update channel.',
      )
    }
  }

  /* Host-scoped survivor guard: after phone-home (step 4) AND the appcast
     repoint (step 5), no cdn.browseros.com string may remain anywhere in the
     framework — otherwise a maintainer poll or update check still reaches
     upstream and can reinstate the bug reporter. Fails loud rather than ship a
     bundle that phones home. */
  if (opts.sparkle === 'disable' && !opts.dryRun) {
    const fw = new Uint8Array(fs.readFileSync(frameworkBinary))
    const survivors = countAscii(fw, 'cdn.browseros.com')
    if (survivors > 0) {
      throw new Error(
        `${survivors} cdn.browseros.com string(s) survive in the framework ` +
          'after patching — a phone-home URL was missed. Add it to ' +
          'PHONE_HOME_PATCHES (same length) before shipping.',
      )
    }
    console.log(
      '      ok: zero cdn.browseros.com strings survive in the framework',
    )
  }

  console.log('[6/7] Signing')
  if (opts.sign && !opts.dryRun) {
    /* Strip extended attributes first. ditto preserves resource forks and
       Finder info, and codesign refuses to sign a nested bundle that carries
       them ("resource fork, Finder information, or similar detritus not
       allowed") — it fails on Sparkle's XPC services otherwise. */
    run('xattr', ['-cr', appOut])
    /* Inside-out: helpers and frameworks first, the .app last. */
    const nested = run('find', [
      appOut,
      '(',
      '-name',
      '*.app',
      '-o',
      '-name',
      '*.framework',
      '-o',
      '-name',
      '*.dylib',
      '-o',
      '-name',
      '*.so',
      '-o',
      '-name',
      '*.xpc',
      ')',
      '-print',
    ])
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((p) => p !== appOut)
      /* Deepest first. */
      .sort((a, b) => b.split('/').length - a.split('/').length)

    /* Entitlements come from the source bundle's twin of each path: the
       output is a `ditto` of it, so the paths line up exactly. See
       `readEntitlements` for why signing without them ships a browser that
       cannot launch. */
    const entDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-ent-'))
    let carried = 0
    const signPreservingEntitlements = (target: string) => {
      const rel = path.relative(appOut, target)
      const twin = rel ? path.join(opts.source, rel) : opts.source
      const xml = fs.existsSync(twin) ? readEntitlements(twin) : undefined
      let entFile: string | undefined
      if (xml) {
        entFile = path.join(entDir, `ent-${carried++}.plist`)
        fs.writeFileSync(entFile, xml)
      }
      run('codesign', codesignArgs(target, opts.identity, entFile))
    }

    for (const target of nested) signPreservingEntitlements(target)
    signPreservingEntitlements(appOut)
    fs.rmSync(entDir, { recursive: true, force: true })
    console.log(`      entitlements carried across on ${carried} target(s)`)

    /* Assert, rather than trust: an entitlement-stripped bundle passes
       codesign --verify, spctl and notarization, and only fails when a user
       double-clicks it. */
    const wanted = entitlementKeys(readEntitlements(opts.source))
    const got = entitlementKeys(readEntitlements(appOut))
    if (wanted.join(',') !== got.join(',')) {
      throw new Error(
        `Entitlements did not survive signing.\n  source: ${wanted.join(', ') || '(none)'}\n  signed: ${got.join(', ') || '(none)'}`,
      )
    }
    console.log(`      ok: ${got.length} entitlement(s) on Astro.app`)

    run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appOut])
  } else {
    console.log('      skipped (--sign not given)')
  }

  console.log('[7/7] Next steps (credentials required — not run here):')
  const dmg = path.join(opts.out, 'Astro.dmg')
  for (const line of [
    /* Notarize and staple the APP first, then build the dmg around the
       already-stapled app: a stapled dmg holding an unstapled app fails
       Gatekeeper on a machine that is offline (`iris-signing-two-bugs`). */
    `ditto -c -k --keepParent "${appOut}" "${appOut}.zip"`,
    `xcrun notarytool submit "${appOut}.zip" --keychain-profile ${NOTARY_PROFILE} --wait`,
    `xcrun stapler staple "${appOut}"`,
    `hdiutil create -volname Astro -srcfolder "${appOut}" -ov -format UDZO "${dmg}"`,
    `codesign --force --timestamp --sign "${opts.identity}" "${dmg}"`,
    ...notarizeCommands(dmg),
  ]) {
    console.log(`      ${line}`)
  }
  console.log('\nSee RELEASING.md for the whole ritual.')
  return appOut
}

/* ------------------------------------------------------------------ */

export function parseArgs(argv: string[]): RecutOptions {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const source = get('--source')
  const crx = get('--crx')
  if (!source || !crx) {
    throw new Error(
      'Usage: bun scripts/release/astro-recut.ts --source <Astro.app> --crx <file.crx> ' +
        '[--out dir] [--version 0.0.101] [--sparkle disable|keep] ' +
        '[--sparkle-feed url] [--sparkle-ed-key base64] [--patch-id] [--sign] [--dry-run]',
    )
  }
  const sparkle = (get('--sparkle') ?? 'disable') as 'disable' | 'keep'
  if (sparkle !== 'disable' && sparkle !== 'keep') {
    throw new Error(`--sparkle must be "disable" or "keep", got "${sparkle}"`)
  }
  const sparkleFeed = get('--sparkle-feed')
  if (sparkleFeed && sparkleFeed.length !== UPSTREAM_APPCAST_URL.length) {
    throw new Error(
      `--sparkle-feed must be exactly ${UPSTREAM_APPCAST_URL.length} characters ` +
        `(it overwrites a string inside the framework); "${sparkleFeed}" is ${sparkleFeed.length}`,
    )
  }
  return {
    source,
    crx,
    out: get('--out') ?? 'dist/astro-recut',
    version: get('--version'),
    sparkle,
    sparkleFeed,
    sparkleEdKey: get('--sparkle-ed-key'),
    sign: argv.includes('--sign'),
    patchId: argv.includes('--patch-id'),
    identity: get('--identity') ?? DEVELOPER_ID,
    dryRun: argv.includes('--dry-run'),
  }
}

if (import.meta.main) {
  try {
    await recut(parseArgs(process.argv.slice(2)))
  } catch (err) {
    console.error(`astro-recut: ${(err as Error).message}`)
    process.exit(1)
  }
}
