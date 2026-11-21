/**
 * @license
 * Copyright 2026 publik
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Background updates on Windows: the pieces astro-recut-win.ts adds to the
 * tree.
 *
 * Upstream's chrome.dll loads WinSparkle.dll from the version folder and
 * calls 18 of its functions (winsparkle_glue.cc; Astro facts run 44853032844
 * in astro-qa-windows). Upstream ships the official WinSparkle 0.9.3, which
 * shows a "Software Update" window for every update. The re-cut replaces it
 * with Astro's fork (https://github.com/Blueturboguy07/winsparkle-astro,
 * README-ASTRO.md there), pinned by sha256, and writes WinSparkle.ini next to
 * it. With that file the fork's scheduled check downloads a newer update,
 * checks its Ed25519 signature (unchanged code) and hands it to chrome.dll's
 * run-installer callback with no window. The package (astro-win.nsi, UPDATER)
 * then stages the new version next to the running one, and the restart helper
 * (astro-restart.cs) asks "Restart now / Later".
 *
 * The fork's version check uses BuildVersion from WinSparkle.ini
 * (10001.<Astro version>) instead of the value compiled into chrome.dll
 * (10000.<BrowserOS version>), so a feed item that is not newer than this
 * build is never downloaded (no downgrade).
 */
import { createHash } from 'node:crypto'
import { updateVersion, validateAppVersion } from './astro-updater'

/** The fork's release this re-cut ships (astro.yml in the fork builds it). */
export const ASTRO_WINSPARKLE_URL =
  'https://github.com/Blueturboguy07/winsparkle-astro/releases/download/astro-v0.9.3-1/WinSparkle.dll'
export const ASTRO_WINSPARKLE_SHA256 =
  '4673b5c8cdde986e1c850ce27479d45fa218066cd1e99aee18c60b6f348ffa3f'

export const WINSPARKLE_DLL = 'WinSparkle.dll'
export const WINSPARKLE_INI = 'WinSparkle.ini'

/** The WinSparkle functions upstream 0.50.5's chrome.dll imports. */
export const WINSPARKLE_GLUE_IMPORTS = [
  'win_sparkle_check_update_with_ui',
  'win_sparkle_cleanup',
  'win_sparkle_init',
  'win_sparkle_set_app_build_version',
  'win_sparkle_set_app_details',
  'win_sparkle_set_appcast_url',
  'win_sparkle_set_automatic_check_for_updates',
  'win_sparkle_set_did_find_update_callback',
  'win_sparkle_set_did_not_find_update_callback',
  'win_sparkle_set_eddsa_public_key',
  'win_sparkle_set_error_callback',
  'win_sparkle_set_registry_path',
  'win_sparkle_set_update_cancelled_callback',
  'win_sparkle_set_update_check_interval',
  'win_sparkle_set_update_dismissed_callback',
  'win_sparkle_set_update_postponed_callback',
  'win_sparkle_set_update_skipped_callback',
  'win_sparkle_set_user_run_installer_callback',
] as const

/** The restart helper: its source (next to this file) and its name on disk. */
export const RESTART_HELPER_SOURCE = 'astro-restart.cs'
export const RESTART_HELPER_EXE = 'astro-restart.exe'

/** WinSparkle.ini for one Astro build (read by the fork, see README-ASTRO.md). */
export function winSparkleIni(appVersion: string): string {
  const v = validateAppVersion(appVersion)
  return [
    '[WinSparkle]',
    'SilentAutoInstall=1',
    `BuildVersion=${updateVersion(v)}`,
    'AppName=Astro',
    `AppVersion=${v}`,
    '',
  ].join('\r\n')
}

export function sha256(buf: Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex')
}

/** Refuses any WinSparkle.dll but the pinned build of the fork. */
export function checkWinSparkleDll(buf: Uint8Array, pinned = ASTRO_WINSPARKLE_SHA256): void {
  const h = sha256(buf)
  if (h !== pinned) {
    throw new Error(
      `WinSparkle.dll sha256 ${h} is not the pinned fork build ${pinned} (${ASTRO_WINSPARKLE_URL})`,
    )
  }
}

/* ------------------------------------------------------------------ */
/* A minimal PE32+ reader: export names and imported names by module.  */
/* ------------------------------------------------------------------ */

type Section = { va: number; vsize: number; raw: number; rawSize: number }
type Pe = { view: DataView; buf: Uint8Array; sections: Section[]; dirs: { rva: number; size: number }[] }

const DIR_EXPORT = 0
const DIR_IMPORT = 1
const DIR_DELAY_IMPORT = 13

function readPe(buf: Uint8Array): Pe {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (buf.length < 0x40 || view.getUint16(0, true) !== 0x5a4d) throw new Error('not a PE file (no MZ)')
  const pe = view.getUint32(0x3c, true)
  if (view.getUint32(pe, true) !== 0x4550) throw new Error('not a PE file (no PE signature)')
  const nSections = view.getUint16(pe + 6, true)
  const optSize = view.getUint16(pe + 20, true)
  const opt = pe + 24
  if (view.getUint16(opt, true) !== 0x20b) throw new Error('not a 64-bit PE (PE32+)')
  const nDirs = view.getUint32(opt + 108, true)
  const dirs = []
  for (let i = 0; i < nDirs; i++) {
    dirs.push({ rva: view.getUint32(opt + 112 + i * 8, true), size: view.getUint32(opt + 116 + i * 8, true) })
  }
  const sections: Section[] = []
  for (let i = 0; i < nSections; i++) {
    const s = opt + optSize + i * 40
    sections.push({
      vsize: view.getUint32(s + 8, true),
      va: view.getUint32(s + 12, true),
      rawSize: view.getUint32(s + 16, true),
      raw: view.getUint32(s + 20, true),
    })
  }
  return { view, buf, sections, dirs }
}

function offsetOf(pe: Pe, rva: number): number {
  for (const s of pe.sections) {
    if (rva >= s.va && rva < s.va + Math.max(s.vsize, s.rawSize)) return s.raw + (rva - s.va)
  }
  throw new Error(`RVA 0x${rva.toString(16)} is in no section`)
}

function cString(pe: Pe, rva: number): string {
  const at = offsetOf(pe, rva)
  let end = at
  while (end < pe.buf.length && pe.buf[end] !== 0) end++
  return Buffer.from(pe.buf.subarray(at, end)).toString('latin1')
}

/** Names in a 64-bit thunk list (import by ordinal shows as "#<n>"). */
function thunkNames(pe: Pe, rva: number): string[] {
  const out: string[] = []
  for (let at = offsetOf(pe, rva); ; at += 8) {
    const lo = pe.view.getUint32(at, true)
    const hi = pe.view.getUint32(at + 4, true)
    if (lo === 0 && hi === 0) break
    if (hi & 0x80000000) out.push(`#${lo & 0xffff}`)
    else out.push(cString(pe, (lo & 0x7fffffff) + 2))
  }
  return out
}

/** The names a 64-bit DLL exports. */
export function peExportNames(buf: Uint8Array): string[] {
  const pe = readPe(buf)
  const d = pe.dirs[DIR_EXPORT]
  if (!d || d.rva === 0) return []
  const at = offsetOf(pe, d.rva)
  const count = pe.view.getUint32(at + 24, true)
  const names = offsetOf(pe, pe.view.getUint32(at + 32, true))
  const out: string[] = []
  for (let i = 0; i < count; i++) out.push(cString(pe, pe.view.getUint32(names + i * 4, true)))
  return out
}

/**
 * What a 64-bit PE imports from one DLL, from the normal and the delay-load
 * import tables (module names compare without case). null: no import of it.
 */
export function peImportsFrom(buf: Uint8Array, dll: string): string[] | null {
  const pe = readPe(buf)
  const want = dll.toLowerCase()
  let found: string[] | null = null
  const imp = pe.dirs[DIR_IMPORT]
  if (imp && imp.rva !== 0) {
    for (let at = offsetOf(pe, imp.rva); ; at += 20) {
      const int = pe.view.getUint32(at, true)
      const name = pe.view.getUint32(at + 12, true)
      const iat = pe.view.getUint32(at + 16, true)
      if (name === 0) break
      if (cString(pe, name).toLowerCase() === want) {
        found = [...(found ?? []), ...thunkNames(pe, int || iat)]
      }
    }
  }
  const del = pe.dirs[DIR_DELAY_IMPORT]
  if (del && del.rva !== 0) {
    for (let at = offsetOf(pe, del.rva); ; at += 32) {
      const name = pe.view.getUint32(at + 4, true)
      const int = pe.view.getUint32(at + 16, true)
      if (name === 0) break
      if (cString(pe, name).toLowerCase() === want) {
        found = [...(found ?? []), ...thunkNames(pe, int)]
      }
    }
  }
  return found
}

/**
 * chrome.dll must import only functions the new WinSparkle.dll exports, or the
 * browser fails at the first update check. Returns the imported names.
 */
export function checkWinSparkleLinks(chromeDll: Uint8Array, winSparkleDll: Uint8Array): string[] {
  const imports = peImportsFrom(chromeDll, WINSPARKLE_DLL)
  if (!imports) throw new Error(`chrome.dll does not import ${WINSPARKLE_DLL}: not the tree the re-cut expects`)
  const exports = new Set(peExportNames(winSparkleDll))
  const missing = imports.filter((n) => !exports.has(n))
  if (missing.length > 0) {
    throw new Error(`the new ${WINSPARKLE_DLL} does not export what chrome.dll imports: ${missing.join(', ')}`)
  }
  return imports
}

/* bun astro-winsparkle.ts fetch <out.dll>: downloads the pinned fork build. */
if (import.meta.main) {
  const [cmd, out] = process.argv.slice(2)
  if (cmd !== 'fetch' || !out) {
    console.error('Usage: bun astro-winsparkle.ts fetch <WinSparkle.dll>')
    process.exit(2)
  }
  const res = await fetch(ASTRO_WINSPARKLE_URL)
  if (!res.ok) {
    console.error(`astro-winsparkle: ${ASTRO_WINSPARKLE_URL}: HTTP ${res.status}`)
    process.exit(1)
  }
  const buf = new Uint8Array(await res.arrayBuffer())
  try {
    checkWinSparkleDll(buf)
  } catch (err) {
    console.error(`astro-winsparkle: ${(err as Error).message}`)
    process.exit(1)
  }
  await Bun.write(out, buf)
  console.log(`${out}: ${buf.length} bytes, sha256 ${ASTRO_WINSPARKLE_SHA256}`)
}
