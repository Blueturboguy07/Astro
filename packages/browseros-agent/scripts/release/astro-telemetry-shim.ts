/**
 * @license
 * Copyright 2026 publik
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Put the usage-count launcher into an Astro bundle.
 *
 * Astro is a re-cut of a prebuilt browser, so nothing in it is compiled per
 * release. The one native program the browser starts by itself is the local
 * server, `BrowserOSServer/default/resources/bin/browseros_server`. The
 * launcher (scripts/release/astro-telemetry, a small Rust program) takes that
 * file name and the real server moves to `browseros_server_real` next to it,
 * byte for byte unchanged. The launcher sends the publik usage counts
 * (app opened, active session — https://publikhq.com/skills/telemetry.md) and
 * runs the real server. See astro-telemetry/src/main.rs for how.
 *
 * The step is safe to repeat: a bundle that already has a launcher gets the
 * new launcher and keeps its real server.
 *
 * macOS (after astro-recut.ts, before notarization). `--app-version` writes the
 * Astro release version into Info.plist; `--sign` signs the launcher and
 * re-seals the app with the entitlements it already has. Nested code is not
 * touched: it keeps the signature it has.
 *
 *   bun scripts/release/astro-telemetry-shim.ts \
 *     --app dist/astro-recut/Astro.app --shim <astro-telemetry-shim> \
 *     --app-version 0.2.2 --sign
 *
 * Windows (on the Chrome-bin tree, before astro-recut-win.ts packages it):
 *
 *   bun scripts/release/astro-telemetry-shim.ts \
 *     --tree <Chrome-bin> --shim <astro-telemetry-shim.exe>
 */
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {
  codesignArgs,
  DEVELOPER_ID,
  entitlementKeys,
  readEntitlements,
} from './astro-recut'

/** The text every launcher binary carries (astro-telemetry/src/main.rs). */
export const SHIM_MARKER = 'astro-telemetry-shim/1'

const SERVER_BIN = ['BrowserOSServer', 'default', 'resources', 'bin']

export function isShim(file: string): boolean {
  return fs.readFileSync(file).includes(SHIM_MARKER)
}

/** `<Astro.app>/Contents/Resources/BrowserOSServer/default/resources/bin` */
export function macServerBinDir(appPath: string): string {
  return path.join(appPath, 'Contents', 'Resources', ...SERVER_BIN)
}

/** `<Chrome-bin>/<chromium version>/BrowserOSServer/default/resources/bin` */
export function winServerBinDir(treeDir: string): string {
  const versions = fs
    .readdirSync(treeDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d+(\.\d+){1,3}$/.test(e.name))
    .map((e) => e.name)
  const [only] = versions
  if (versions.length !== 1 || !only) {
    throw new Error(
      `Expected exactly one versioned dir in ${treeDir}, found: ` +
        `${versions.join(', ') || '(none)'}. Is this a Chrome-bin tree?`,
    )
  }
  return path.join(treeDir, only, ...SERVER_BIN)
}

export type InstallResult = {
  server: string
  real: string
  action: 'installed' | 'replaced'
}

/**
 * Move the real server aside (first time only) and put the launcher at the
 * server path. Fails loud on any state that is not one of the two it knows:
 * a plain server, or a launcher with its real server next to it.
 */
export function installShim(opts: {
  binDir: string
  shim: string
  exe: '' | '.exe'
}): InstallResult {
  const server = path.join(opts.binDir, `browseros_server${opts.exe}`)
  const real = path.join(opts.binDir, `browseros_server_real${opts.exe}`)
  if (!fs.existsSync(opts.shim) || !isShim(opts.shim)) {
    throw new Error(`Not an astro-telemetry-shim binary: ${opts.shim}`)
  }
  if (!fs.existsSync(server)) {
    throw new Error(`Local server not found: ${server}`)
  }
  const serverIsShim = isShim(server)
  const hasReal = fs.existsSync(real)
  if (serverIsShim !== hasReal) {
    throw new Error(
      serverIsShim
        ? `${server} is a launcher but ${real} is missing — the real server is gone.`
        : `${real} exists but ${server} is not a launcher — refusing to overwrite a server.`,
    )
  }
  if (!hasReal) fs.renameSync(server, real)
  fs.copyFileSync(opts.shim, server)
  fs.chmodSync(server, 0o755)
  return { server, real, action: hasReal ? 'replaced' : 'installed' }
}

/** The Astro release version as Chrome-style 1–4 dot-separated integers. */
export function validateAppVersion(version: string): string {
  if (!/^\d+(\.\d+){1,3}$/.test(version)) {
    throw new Error(`--app-version must look like 0.2.2, got "${version}"`)
  }
  return version
}

const run = (cmd: string, args: string[]) => {
  const res = spawnSync(cmd, args, { encoding: 'utf8' })
  if (res.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(' ')} failed (${res.status}): ${res.stderr || res.stdout}`,
    )
  }
  return res.stdout
}

export type ShimOptions = {
  app?: string
  tree?: string
  shim: string
  appVersion?: string
  sign: boolean
  identity: string
}

export function installIntoBundle(opts: ShimOptions): InstallResult {
  if (opts.tree) {
    const result = installShim({
      binDir: winServerBinDir(opts.tree),
      shim: opts.shim,
      exe: '.exe',
    })
    console.log(`[shim] ${result.action}: ${result.server}`)
    return result
  }
  const app = opts.app as string
  if (process.platform !== 'darwin') {
    throw new Error('--app runs on macOS: it needs plutil and codesign.')
  }
  /* Read the entitlements before anything changes. Signing writes the set it
     is given and no others (see readEntitlements in astro-recut.ts), and a
     browser without allow-jit does not start. */
  const entitlements = readEntitlements(app)
  const result = installShim({
    binDir: macServerBinDir(app),
    shim: opts.shim,
    exe: '',
  })
  console.log(`[shim] ${result.action}: ${result.server}`)

  if (opts.appVersion) {
    /* CFBundleShortVersionString is what Finder shows. CFBundleVersion and the
       framework version stay the prebuilt browser's: the browser finds its
       framework by them. */
    run('plutil', [
      '-replace',
      'CFBundleShortVersionString',
      '-string',
      validateAppVersion(opts.appVersion),
      path.join(app, 'Contents', 'Info.plist'),
    ])
    console.log(`[shim] CFBundleShortVersionString = ${opts.appVersion}`)
  }

  if (!opts.sign) {
    console.log('[shim] not signed (--sign not given)')
    return result
  }
  if (!entitlements) {
    throw new Error(`${app} carries no entitlements — is it a signed Astro?`)
  }
  run('xattr', ['-cr', app])
  /* Inside-out: the launcher first, the app last. The real server, the
     framework and the helpers keep the valid signatures they already carry. */
  run('codesign', codesignArgs(result.server, opts.identity))
  const entFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astro-shim-ent-')),
    'app.plist',
  )
  fs.writeFileSync(entFile, entitlements)
  try {
    run('codesign', codesignArgs(app, opts.identity, entFile))
  } finally {
    fs.rmSync(path.dirname(entFile), { recursive: true, force: true })
  }
  const wanted = entitlementKeys(entitlements)
  const got = entitlementKeys(readEntitlements(app))
  if (wanted.join(',') !== got.join(',')) {
    throw new Error(
      `Entitlements did not survive signing.\n  before: ${wanted.join(', ')}\n  after:  ${got.join(', ') || '(none)'}`,
    )
  }
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app])
  console.log(`[shim] signed; ${got.length} entitlement(s) kept on the app`)
  return result
}

export function parseArgs(argv: string[]): ShimOptions {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const app = get('--app')
  const tree = get('--tree')
  const shim = get('--shim')
  if (!shim || (app ? 1 : 0) + (tree ? 1 : 0) !== 1) {
    throw new Error(
      'Usage: bun scripts/release/astro-telemetry-shim.ts ' +
        '(--app <Astro.app> [--app-version 0.2.2] [--sign] | --tree <Chrome-bin>) ' +
        '--shim <astro-telemetry-shim binary>',
    )
  }
  return {
    app,
    tree,
    shim,
    appVersion: get('--app-version'),
    sign: argv.includes('--sign'),
    identity: get('--identity') ?? DEVELOPER_ID,
  }
}

if (import.meta.main) {
  try {
    installIntoBundle(parseArgs(process.argv.slice(2)))
  } catch (err) {
    console.error(`astro-telemetry-shim: ${(err as Error).message}`)
    process.exit(1)
  }
}
