/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * SearXNG lifecycle manager — the local, keyless search backend.
 *
 * Ported from Simplicity (~/Vane desktop/searxng.mjs), MIT (c) ItzCrazyKns.
 *
 * SearXNG is a Python/Flask service that upstream only ships inside a Docker
 * image, which a browser can't assume is installed. So we provision it the way
 * BrowserOS provisions other sidecars:
 *   1. reuse whatever the user already runs, if something answers
 *   2. else download a relocatable CPython plus the SearXNG source into the
 *      BrowserOS data dir (one time) and pip-install it there
 *   3. run it with Flask on a loopback port, keeping a handle for teardown
 *
 * Search stays free, local and private: no Docker, nothing on PATH, no account,
 * no API key. The Dockerfile's uwsgi is never used at runtime — plain
 * `flask run` is what upstream actually serves.
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { getBrowserosDir } from '../browseros-dir'
import { logger } from '../logger'
import { ensureSettings, writeSettings } from './settings'

const HOST = '127.0.0.1'
const READY_TIMEOUT_MS = 60_000
const READY_POLL_MS = 500
const PROBE_TIMEOUT_MS = 1500
const USER_AGENT = 'BrowserOS'
const PIP_TIMEOUT_MS = 10 * 60_000
const TAR_TIMEOUT_MS = 5 * 60_000
const DOWNLOAD_TIMEOUT_MS = 15 * 60_000
/* A failed setup is never retried by itself: each attempt on a machine
   where macOS blocks the downloaded Python put one more "python3.12 Not
   Opened" dialog on the person's screen (about 200 in the QA run, F-002).
   The failure is kept in this file, across server restarts, until the
   person presses Retry. */
const FAILURE_FILE = '.setup-failed.json'
/* Another server with the same data dir (a second profile) holds the lock
   while it sets up; a lock older than this is from a process that died. */
const LOCK_STALE_MS = 20 * 60_000
const LOCK_POLL_MS = 1000

/* python-build-standalone publishes relocatable CPython builds for every target
   we ship to. A venv bakes in absolute paths to its base interpreter, so a venv
   can't be moved into an app bundle — these can. */
const PY_SERIES = '3.12'
const PBS_LATEST =
  'https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest'
const SEARXNG_TARBALL =
  'https://codeload.github.com/searxng/searxng/tar.gz/refs/heads/master'

const isWin = process.platform === 'win32'

let proc: ReturnType<typeof spawn> | null = null
let runningURL: string | null = null

interface SearxngPaths {
  root: string
  python: string
  src: string
  settings: string
  marker: string
  lock: string
}

/* What the answer UI shows while the one-time setup runs, and why it
   failed. One process-wide value: every caller shares one setup. */
export type SearchSetupStatus =
  | { state: 'idle' }
  | {
      state: 'setting_up'
      step: 'python' | 'searxng' | 'dependencies' | 'starting'
      percent: number | null
      message: string
    }
  | { state: 'ready'; url: string }
  | { state: 'failed'; message: string; at: number }

let status: SearchSetupStatus = { state: 'idle' }
const listeners = new Set<(s: SearchSetupStatus) => void>()

export function getSearchSetupStatus(): SearchSetupStatus {
  return status
}

export function onSearchSetupStatus(
  cb: (s: SearchSetupStatus) => void,
): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function setStatus(next: SearchSetupStatus) {
  status = next
  for (const cb of listeners) {
    try {
      cb(next)
    } catch {}
  }
}

function settingUp(
  step: Extract<SearchSetupStatus, { state: 'setting_up' }>['step'],
  percent: number | null = null,
) {
  const what = {
    python: 'downloading Python',
    searxng: 'downloading the search engine',
    dependencies: 'installing the search packages',
    starting: '',
  }[step]
  const pct = percent === null ? '' : ` ${percent}%`
  setStatus({
    state: 'setting_up',
    step,
    percent,
    message:
      step === 'starting'
        ? 'Starting web search'
        : `Setting up web search (one time, about 150 MB): ${what}${pct}`,
  })
}

function paths(dataDir: string): SearxngPaths {
  const root = path.join(dataDir, 'searxng')
  return {
    root,
    python: path.join(root, 'python'),
    src: path.join(root, 'searxng-src'),
    settings: path.join(root, 'settings.yml'),
    marker: path.join(root, '.provisioned'),
    lock: path.join(dataDir, 'searxng.lock'),
  }
}

/* Written into a step's directory once that step is complete, so a failed
   later step does not throw away (and download again) an earlier one. */
const STEP_MARKER = '.astro-ready'

function pythonBin(p: SearxngPaths): string {
  return isWin
    ? path.join(p.python, 'python.exe')
    : path.join(p.python, 'bin', 'python3')
}

function isProvisioned(dataDir: string = getBrowserosDir()): boolean {
  try {
    return fs.existsSync(paths(dataDir).marker)
  } catch {
    return false
  }
}

async function isServing(url: string | null): Promise<boolean> {
  if (!url) return false
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    return res.ok
  } catch {
    return false
  }
}

async function waitUntilServing(url: string, timeoutMs = READY_TIMEOUT_MS) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await isServing(url)) return true
    await new Promise((r) => setTimeout(r, READY_POLL_MS))
  }
  return false
}

/* Ask the OS for a free port rather than hardcoding 8080 — the user may well
   already have something there, including their own SearXNG. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, HOST, () => {
      const { port } = srv.address() as net.AddressInfo
      srv.close(() => resolve(port))
    })
  })
}

/* Streamed to disk so the percent can be shown and a 100 MB body is never
   held in memory twice. */
async function download(
  url: string,
  dest: string,
  label: string,
  onPercent?: (percent: number) => void,
) {
  logger.info(`Downloading ${label}`)
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  })
  if (!res.ok || !res.body) {
    throw new Error(`the download of ${label} failed (HTTP ${res.status})`)
  }
  const total = Number(res.headers.get('content-length')) || 0
  const fd = fs.openSync(dest, 'w')
  let received = 0
  let lastPercent = -1
  try {
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      fs.writeSync(fd, value)
      received += value.byteLength
      if (total && onPercent) {
        const percent = Math.min(99, Math.floor((received / total) * 100))
        if (percent !== lastPercent) {
          lastPercent = percent
          onPercent(percent)
        }
      }
    }
  } finally {
    fs.closeSync(fd)
  }
  if (total && received !== total) {
    throw new Error(`the download of ${label} stopped before the end`)
  }
}

function pbsTriple(): string {
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
  if (process.platform === 'darwin') return `${arch}-apple-darwin`
  if (isWin) return `${arch}-pc-windows-msvc`
  return `${arch}-unknown-linux-gnu`
}

async function resolvePythonURL(): Promise<string> {
  const res = await fetch(PBS_LATEST, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    throw new Error(
      `could not reach python-build-standalone (HTTP ${res.status})`,
    )
  }
  const triple = pbsTriple()
  const assets = (await res.json()) as {
    assets: { name: string; browser_download_url: string }[]
  }
  const asset = assets.assets.find(
    (a) =>
      a.name.startsWith(`cpython-${PY_SERIES}.`) &&
      a.name.includes(triple) &&
      a.name.endsWith('install_only.tar.gz'),
  )
  if (!asset) throw new Error(`no CPython ${PY_SERIES} build for ${triple}`)
  return asset.browser_download_url
}

/* macOS's own tar is always present even when an app gets a minimal PATH;
   Windows 10+ ships bsdtar as tar.exe. */
function tarBin(): string {
  return isWin ? 'tar' : '/usr/bin/tar'
}

/**
 * Runs a child process without blocking the server. execFileSync froze every
 * request (health checks included) for the minutes pip takes, and its error
 * said only "Command failed". This one rejects with the exit code or signal
 * and the end of stderr, which is what names the real problem.
 */
export function runProcess(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = ''
    let timedOut = false
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, opts.timeoutMs)
    child.stderr?.on('data', (c: Buffer) => {
      stderr = (stderr + c.toString()).slice(-4000)
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(new Error(`could not run ${path.basename(cmd)}: ${err.message}`))
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) return resolve()
      const name = `${path.basename(cmd)} ${args.slice(0, 3).join(' ')}`
      const tail = stderr.trim().split('\n').slice(-3).join(' ').slice(-300)
      const why = timedOut
        ? `timed out after ${Math.round(opts.timeoutMs / 60_000)} min`
        : signal
          ? `was stopped by the system (${signal})`
          : `exited with code ${code}`
      reject(new Error(`${name} ${why}${tail ? `: ${tail}` : ''}`))
    })
  })
}

async function extract(tgz: string, into: string, excludes: string[] = []) {
  /* A previous failed attempt leaves a partial tree behind — start clean so a
     relaunch actually recovers. */
  fs.rmSync(into, { recursive: true, force: true })
  fs.mkdirSync(into, { recursive: true })
  await runProcess(
    tarBin(),
    [
      'xzf',
      tgz,
      '-C',
      into,
      '--strip-components=1',
      ...excludes.flatMap((pattern) => ['--exclude', pattern]),
    ],
    { timeoutMs: TAR_TIMEOUT_MS },
  )
  fs.rmSync(tgz, { force: true })
}

/* python-build-standalone's CPython isn't Apple Developer ID signed or
   notarized. Astro.app quarantines every file its processes create (the
   server and its children included: the extracted tree carried
   `com.apple.quarantine …;Astro;`), and macOS kills a quarantined,
   un-notarized binary at exec — observed as pip "stopped by the system
   (SIGKILL)" right after the download. pip's own wheels (.so files) are
   created quarantined too, so this runs after every step, not only after
   the extraction. Astro.app is itself notarized and just verified this tree
   came from the pinned release asset, so it's safe to clear quarantine here
   before execution, the same way Homebrew and other tool-downloading apps do
   for binaries they fetch into their own private data directory. Only runs
   on macOS. `xattr -dr` exits 0 whether or not anything was quarantined. */
export async function clearQuarantine(dir: string): Promise<void> {
  if (process.platform !== 'darwin') return
  /* A child process, not execFileSync: on the pip tree (thousands of files)
     xattr takes long enough to matter, and nothing may block the server's
     event loop during the setup (F-025). */
  try {
    /* -s: a symlink's own flag too (python/bin/2to3 -> 2to3-3.12). Without
       it the links kept the flag and the gate refused to run anything
       (found in the 0.0.109 UI run). Regular files and folders are
       reached by -r either way. */
    await runProcess('/usr/bin/xattr', ['-drs', 'com.apple.quarantine', dir], {
      timeoutMs: 120_000,
    })
  } catch (err) {
    logger.warn('Could not clear quarantine on downloaded Python runtime', {
      dir,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** The first file under `dir` that still has com.apple.quarantine, or null. */
export function findQuarantined(
  dir: string,
  timeoutMs = 60_000,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let out = ''
    const child = spawn(
      '/usr/bin/find',
      [dir, '-xattrname', 'com.apple.quarantine', '-print', '-quit'],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    )
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.stdout?.on('data', (d) => {
      out += String(d)
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(`could not check ${dir} for the macOS download flag`))
        return
      }
      const first = out.split('\n')[0]?.trim()
      resolve(first ? first : null)
    })
  })
}

/**
 * The gate before Astro runs anything it downloaded: clears the macOS
 * quarantine flag on the whole tree, then checks that no file still has it.
 * If one does, nothing runs: macOS would block it and show the person a
 * "python3.12 Not Opened" dialog (F-002).
 */
export async function ensureNoQuarantine(
  dir: string,
  deps: {
    platform?: NodeJS.Platform
    clear?: (dir: string) => Promise<void>
    find?: (dir: string) => Promise<string | null>
  } = {},
): Promise<void> {
  if ((deps.platform ?? process.platform) !== 'darwin') return
  const find = deps.find ?? findQuarantined
  const first = await find(dir)
  if (!first) return
  await (deps.clear ?? clearQuarantine)(dir)
  logger.info(
    'Cleared the macOS download flag before running downloaded code',
    {
      dir,
      example: path.relative(dir, first),
    },
  )
  const left = await find(dir)
  if (left) {
    throw new Error(
      `macOS still marks ${path.relative(dir, left) || left} as downloaded, so Astro did not run it`,
    )
  }
}

/* Skipped when unpacking the SearXNG repo — and ONLY the SearXNG repo. Its
   deployment scripting (utils/, container/) contains a symlink, and Windows
   tar.exe can't create symlinks without admin rights, which kills the whole
   extraction. None of these paths are needed to RUN SearXNG.

   The patterns are anchored to the tarball's root directory on purpose:
   bsdtar's `*` matches across `/`, so a bare pattern like '*\/utils' also
   deletes every directory named utils at ANY depth — applied to the Python
   runtime tarball it strips pip's _internal/utils and breaks pip entirely
   (observed: fresh installs dying at "pip install --upgrade"). */
const SEARXNG_EXCLUDES = [
  'searxng-*/utils',
  'searxng-*/utils/*',
  'searxng-*/container',
  'searxng-*/container/*',
  'searxng-*/.github',
  'searxng-*/.github/*',
]

/* SearXNG's master branch assumes a git checkout on a POSIX host in two spots
   that break a fresh Windows provision. Both are patched against the extracted
   source before pip runs. */
function patchSearxng(p: SearxngPaths) {
  const searx = path.join(p.src, 'searx')

  /* 1. Version detection. searx/version.py shells out to `git` at import time,
     which runs during the editable `pip install` (setup's metadata build). It
     catches CalledProcessError but NOT FileNotFoundError, so a machine with no
     git on PATH dies mid-install with "FileNotFoundError". version.py imports
     searx.version_frozen first and only falls back to git, so writing that
     frozen module — exactly what upstream's `searx.version freeze` emits for
     out-of-git builds — sidesteps git entirely. */
  try {
    const frozen = path.join(searx, 'version_frozen.py')
    if (fs.existsSync(searx) && !fs.existsSync(frozen)) {
      fs.writeFileSync(
        frozen,
        `# SPDX-License-Identifier: AGPL-3.0-or-later
# generated by BrowserOS's search provisioner for out-of-git builds
VERSION_STRING = "1.0.0"
VERSION_TAG = "1.0.0"
DOCKER_TAG = "1.0.0"
GIT_URL = "unknown"
GIT_BRANCH = "unknown"
`,
      )
    }
  } catch {
    /* If upstream restructures versioning this freeze is moot; let the build
       surface any real error itself. */
  }

  /* 2. searx/valkeydb.py does a top-level `import pwd` — a Unix-only stdlib
     module absent on Windows — so webapp.py fails to import and Flask never
     boots. pwd is used only to name the current user in one valkey-connection
     error-log branch we never reach (no valkey.url is configured), so guarding
     the import is enough. Windows-only. */
  if (isWin) {
    try {
      const file = path.join(searx, 'valkeydb.py')
      const src = fs.readFileSync(file, 'utf8')
      if (
        src.includes('import pwd\n') &&
        !src.includes('except ModuleNotFoundError')
      ) {
        fs.writeFileSync(
          file,
          src.replace(
            'import pwd\n',
            'try:\n    import pwd\nexcept ModuleNotFoundError:  # Windows has no pwd module\n    pwd = None\n',
          ),
        )
      }
    } catch {
      /* If upstream restructures this file the import guard is moot. */
    }
  }
}

const pipEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  PIP_DISABLE_PIP_VERSION_CHECK: '1',
  PIP_NO_INPUT: '1',
  PYTHONNOUSERSITE: '1',
})

/** One-time setup under the BrowserOS data dir. Uninstall is a single rm -rf. */
async function provision(
  dataDir: string = getBrowserosDir(),
): Promise<SearxngPaths> {
  const p = paths(dataDir)
  if (isProvisioned(dataDir)) return p

  fs.mkdirSync(p.root, { recursive: true })
  logger.info('Setting up local search, a one-time download of about 150 MB')

  /* Each step's marker is written only when that step is complete. A step
     without its marker was cut off: its remains are poison (the old code
     reused a half-extracted Python), so that step alone starts again. */
  const pythonReady = path.join(p.python, STEP_MARKER)
  if (!fs.existsSync(pythonReady)) {
    settingUp('python', 0)
    const tgz = path.join(p.root, 'python.tar.gz')
    await download(await resolvePythonURL(), tgz, 'the Python runtime', (pct) =>
      settingUp('python', pct),
    )
    await clearQuarantine(tgz)
    await extract(tgz, p.python)
    await ensureNoQuarantine(p.root)
    await runProcess(pythonBin(p), ['-c', 'import ssl, sqlite3'], {
      timeoutMs: 60_000,
    })
    fs.writeFileSync(pythonReady, new Date().toISOString())
  }

  const srcReady = path.join(p.src, STEP_MARKER)
  if (!fs.existsSync(srcReady)) {
    settingUp('searxng')
    const tgz = path.join(p.root, 'searxng.tar.gz')
    await download(SEARXNG_TARBALL, tgz, 'the SearXNG search engine')
    await extract(tgz, p.src, SEARXNG_EXCLUDES)
    patchSearxng(p)
    fs.writeFileSync(srcReady, new Date().toISOString())
  }

  const py = pythonBin(p)
  settingUp('dependencies')
  await ensureNoQuarantine(p.root)
  logger.info('Installing search dependencies')
  /* Same two-step upstream's Dockerfile uses: seed the build deps, then install
     SearXNG itself editable so it keeps its templates and static assets. */
  await runProcess(
    py,
    [
      '-m',
      'pip',
      'install',
      '--upgrade',
      'pip',
      'setuptools',
      'wheel',
      'pyyaml',
      'msgspec',
      'typing_extensions',
    ],
    { env: pipEnv(), timeoutMs: PIP_TIMEOUT_MS },
  )
  await ensureNoQuarantine(p.root)
  await runProcess(
    py,
    [
      '-m',
      'pip',
      'install',
      '--use-pep517',
      '--no-build-isolation',
      '-e',
      p.src,
    ],
    { env: pipEnv(), timeoutMs: PIP_TIMEOUT_MS },
  )
  await ensureNoQuarantine(p.root)

  writeSettings(p.settings)
  fs.writeFileSync(p.marker, new Date().toISOString())
  logger.info('Local search is ready')
  return p
}

const pidAlive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/* The data dir is shared by every server that runs with the same HOME (two
   profiles, or BrowserOS beside Astro). Only one of them may set up search:
   the other waits, then finds the marker. */
async function withSetupLock<T>(
  p: SearxngPaths,
  fn: () => Promise<T>,
): Promise<T> {
  const deadline = Date.now() + LOCK_STALE_MS
  for (;;) {
    try {
      fs.mkdirSync(path.dirname(p.lock), { recursive: true })
      const fd = fs.openSync(p.lock, 'wx')
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }))
      fs.closeSync(fd)
      break
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      let holder: { pid?: number; at?: number } = {}
      try {
        holder = JSON.parse(fs.readFileSync(p.lock, 'utf8'))
      } catch {}
      const stale =
        !holder.pid ||
        holder.pid === process.pid ||
        !pidAlive(holder.pid) ||
        Date.now() - (holder.at ?? 0) > LOCK_STALE_MS
      if (stale) {
        fs.rmSync(p.lock, { force: true })
        continue
      }
      if (Date.now() > deadline) {
        throw new Error('another Astro window is still setting up web search')
      }
      await new Promise((r) => setTimeout(r, LOCK_POLL_MS))
    }
  }
  try {
    return await fn()
  } finally {
    fs.rmSync(p.lock, { force: true })
  }
}

/**
 * Wraps an async job so concurrent callers share one run. A failure is
 * returned again, without a new run, until `reset()` (the Retry button).
 * The first search of an answer fires several queries plus the image and
 * video searches at once; each used to start its own setup, and each
 * deleted the tree the others were downloading and executing.
 */
export function singleFlight<T>(
  job: () => Promise<T>,
): (() => Promise<T>) & { reset: () => void } {
  let running: Promise<T> | null = null
  let failure: Error | null = null
  const run = () => {
    if (running) return running
    if (failure) return Promise.reject(failure)
    running = job()
      .catch((err: unknown) => {
        failure = err instanceof Error ? err : new Error(String(err))
        throw failure
      })
      .finally(() => {
        running = null
      })
    return running
  }
  return Object.assign(run, {
    reset: () => {
      failure = null
    },
  })
}

function failureFile(dataDir: string): string {
  return path.join(paths(dataDir).root, FAILURE_FILE)
}

function readFailure(dataDir: string): string | null {
  try {
    const v = JSON.parse(fs.readFileSync(failureFile(dataDir), 'utf8')) as {
      message?: string
    }
    return v.message || 'the last setup failed'
  } catch {
    return null
  }
}

function writeFailure(dataDir: string, message: string): void {
  try {
    fs.mkdirSync(paths(dataDir).root, { recursive: true })
    fs.writeFileSync(
      failureFile(dataDir),
      JSON.stringify({ message, at: new Date().toISOString() }),
    )
  } catch {}
}

/**
 * `python -c` source that runs `flask run` and exits when its parent (the
 * server) is gone. A server that was killed left SearXNG running with no
 * parent, still listening (Astro 0.2.4 QA, F-073); the stop paths also kill
 * it (`shutdown`, and on process exit).
 */
export function flaskWithParentWatch(
  host: string,
  port: number,
  parentPid: number = process.pid,
): string {
  return [
    'import os, runpy, sys, threading, time',
    /* The server's pid, not getppid() at start: if the server is already
       gone then, getppid() is 1 and the watch would never fire. */
    `parent = ${Math.trunc(parentPid)}`,
    'def watch():',
    '    while True:',
    '        time.sleep(2)',
    '        if os.getppid() != parent:',
    '            os._exit(0)',
    'threading.Thread(target=watch, daemon=True).start()',
    `sys.argv = ['flask', 'run', '--host', ${JSON.stringify(host)}, '--port', ${JSON.stringify(String(port))}]`,
    "runpy.run_module('flask', run_name='__main__', alter_sys=True)",
  ].join('\n')
}

let exitHookInstalled = false

async function startOnce(dataDir: string): Promise<string> {
  if (runningURL && (await isServing(runningURL))) return runningURL

  const earlier = readFailure(dataDir)
  if (earlier) {
    setStatus({ state: 'failed', message: earlier, at: Date.now() })
    throw new Error(`Web search is not available: ${earlier}`)
  }

  try {
    const p = isProvisioned(dataDir)
      ? paths(dataDir)
      : await withSetupLock(paths(dataDir), () => provision(dataDir))
    /* Also brings settings an older build wrote up to date (F-088). */
    ensureSettings(p.settings)
    /* Also for a tree an older build installed: never exec a quarantined
       Python. */
    await ensureNoQuarantine(p.root)

    settingUp('starting')
    const port = await freePort()
    const url = `http://${HOST}:${port}`

    /* Keep Flask's output — when search fails to come up, its traceback is the
       only thing that explains why. */
    const logDir = path.join(dataDir, 'logs')
    fs.mkdirSync(logDir, { recursive: true })
    const fd = fs.openSync(path.join(logDir, 'searxng.log'), 'a')

    proc = spawn(pythonBin(p), ['-c', flaskWithParentWatch(HOST, port)], {
      cwd: p.src,
      env: {
        ...process.env,
        FLASK_APP: 'searx/webapp.py',
        SEARXNG_SETTINGS_PATH: p.settings,
      },
      stdio: ['ignore', fd, fd],
      detached: false,
    })
    proc.on('exit', () => {
      proc = null
      runningURL = null
    })
    if (!exitHookInstalled) {
      exitHookInstalled = true
      process.on('exit', shutdown)
    }

    if (!(await waitUntilServing(url))) {
      throw new Error("the search engine started but isn't responding")
    }
    runningURL = url
    setStatus({ state: 'ready', url })
    return url
  } catch (err) {
    let message = err instanceof Error ? err.message : String(err)
    if (/SIGKILL/.test(message)) {
      message = `${message.replace(/\.$/, '')}. macOS may have blocked the downloaded Python`
    }
    logger.warn('Local search setup failed', { error: message })
    writeFailure(dataDir, message)
    setStatus({ state: 'failed', message, at: Date.now() })
    throw new Error(`Web search is not available: ${message}`)
  }
}

const flights = new Map<string, ReturnType<typeof singleFlight<string>>>()

/** Starts SearXNG and returns its loopback URL. Provisions first if needed. One run at a time per data dir. */
export function start(dataDir: string = getBrowserosDir()): Promise<string> {
  let flight = flights.get(dataDir)
  if (!flight) {
    flight = singleFlight(() => startOnce(dataDir))
    flights.set(dataDir, flight)
  }
  return flight()
}

/**
 * The Retry button: forgets the failed setup and starts one new attempt in
 * the background. Never called by Astro itself.
 */
export function retrySearchSetup(dataDir: string = getBrowserosDir()): void {
  fs.rmSync(failureFile(dataDir), { force: true })
  flights.get(dataDir)?.reset()
  if (status.state === 'failed') setStatus({ state: 'idle' })
  start(dataDir).catch(() => undefined)
}

/** Returns the URL of the running instance, or null when not started. */
export function getRunningURL(): string | null {
  return runningURL
}

export function shutdown(): void {
  if (!proc) return
  try {
    proc.kill()
  } catch {
    /* already gone */
  }
  proc = null
  runningURL = null
}
