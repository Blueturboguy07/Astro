// Start, drive and quit the INSTALLED Astro on the runner, headed.
//
// Gotchas (same as .github/workflows/release-windows-astro.yml):
//  - never pass --remote-debugging-port: the bundled server then never
//    connects. Read the managed ports from <profile>\.browseros\config.json.
//  - the MV3 service worker of the agent can be lazy; open an app page to wake it.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { listTargets } from './cdp.mjs'
import { sleep, waitFor } from './rows.mjs'
import { appProcs, closeAppWindows, INSTALL_DIR } from './win.mjs'

export const ASTRO_EXE = process.env.ASTRO_EXE || path.join(INSTALL_DIR, 'chrome.exe')
export const EXT_ID = 'kofbmbngmnnpmopgbhpbajhnnnoflolg'
export const BUGREPORTER_ID = 'adlpneommgkgeanpaekgoaolcpncohkf'
export const UPSTREAM_AGENT_ID = 'bflpfmnmnokmjhmgnolecpppdbdophmk'
export const EXT_ORIGIN = `chrome-extension://${EXT_ID}`
export const APP_URL = `${EXT_ORIGIN}/app.html`
export const GATE_URL = `${APP_URL}#/home`
export const SELFTEST_URL = `${APP_URL}#/publik/self-test`
export const WORK = process.env.QA_WORK || path.join(os.tmpdir(), 'astro-qa')
export const USER_ARGS = ['--no-first-run', '--no-default-browser-check']

export const profilePath = (name) => path.join(WORK, 'profiles', name)

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

async function cdpAlive(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) })
    return r.ok
  } catch {
    return false
  }
}

export async function httpGet(url, timeoutMs = 5000) {
  const t0 = Date.now()
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' })
    const body = await r.text().catch(() => '')
    return { url, status: r.status, ok: r.ok, ms: Date.now() - t0, body: body.slice(0, 2000), finalUrl: r.url, contentType: r.headers.get('content-type') }
  } catch (e) {
    return { url, status: 0, ok: false, ms: Date.now() - t0, error: String(e?.cause?.code ?? e?.message ?? e) }
  }
}

/** Poll the managed server until /health answers 200. */
export async function waitHealth(server, timeoutMs = 120_000) {
  const t0 = Date.now()
  let last = null
  while (Date.now() - t0 < timeoutMs) {
    last = await httpGet(`http://127.0.0.1:${server}/health`, 4000)
    if (last.status === 200) break
    await sleep(2000)
  }
  const sys = await httpGet(`http://127.0.0.1:${server}/system/health`, 4000)
  return { health: last, systemHealth: sys, ms: Date.now() - t0, ok: last?.status === 200 }
}

/**
 * Launch chrome.exe on a profile (headed) and wait for the managed ports.
 * Returns a session: { profile, pid, cfg, cdp, server, t0, configMs }.
 */
export async function launch({ profile, fresh = false, args = [], userArgs = USER_ARGS, configTimeoutMs = 120_000 } = {}) {
  if (fresh) fs.rmSync(profile, { recursive: true, force: true })
  fs.mkdirSync(profile, { recursive: true })
  const cfgFile = path.join(profile, '.browseros', 'config.json')
  const before = fs.existsSync(cfgFile) ? fs.statSync(cfgFile).mtimeMs : 0
  const t0 = Date.now()
  const argv = [`--user-data-dir=${profile}`, ...userArgs, ...args]
  const child = spawn(ASTRO_EXE, argv, { detached: true, stdio: 'ignore' })
  child.unref()
  const session = { profile, pid: child.pid, argv, t0, cfgFile, exitCode: null }
  child.on('exit', (c) => {
    session.exitCode = c
  })
  session.cfg = await waitFor(
    async () => {
      if (!fs.existsSync(cfgFile)) return null
      const j = readJson(cfgFile)
      if (!(j?.ports?.cdp && j?.ports?.server)) return null
      const fresh = fs.statSync(cfgFile).mtimeMs > before
      // A second start may keep the file as is; accept it once its CDP port answers.
      if (fresh || (Date.now() - t0 > 15_000 && (await cdpAlive(j.ports.cdp)))) return j
      return null
    },
    { timeoutMs: configTimeoutMs, intervalMs: 1000, what: `${cfgFile} with ports.cdp and ports.server` },
  )
  session.configMs = Date.now() - t0
  session.cdp = session.cfg.ports.cdp
  session.server = session.cfg.ports.server
  await waitFor(() => cdpAlive(session.cdp), { timeoutMs: 60_000, what: `CDP on ${session.cdp}` })
  return session
}

/** Launch through a shortcut (.lnk) the way a person does: ShellExecute, no flags. */
export function launchShortcut(lnk) {
  const t0 = Date.now()
  const lit = lnk.replace(/'/g, "''")
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Start-Process -FilePath '${lit}'`], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
  return t0
}

/** Playwright over the managed CDP port. */
export async function connect(session) {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${session.cdp}`, { timeout: 60_000 })
  session.browser = browser
  session.context = browser.contexts()[0]
  return session
}

export async function disconnect(session) {
  if (!session?.browser) return
  try {
    await session.browser.close()
  } catch {}
  session.browser = null
  session.context = null
}

/** Tabs (type "page") from the DevTools target list. */
export async function pageTargets(cdp) {
  const t = await listTargets(cdp)
  return t.filter((x) => x.type === 'page')
}

export async function waitGateTab(cdp, timeoutMs = 60_000) {
  return waitFor(
    async () => {
      const pages = await pageTargets(cdp)
      return pages.find((p) => p.url.startsWith(APP_URL)) ? pages : null
    },
    { timeoutMs, what: 'an app.html tab (the gate)' },
  )
}

/** Find (or wait for) the Playwright page whose URL starts with `prefix`. */
export async function findPage(session, prefix, timeoutMs = 30_000) {
  return waitFor(() => session.context.pages().find((p) => p.url().startsWith(prefix)), { timeoutMs, what: `page ${prefix}` })
}

export async function openPage(session, url, { waitUntil = 'domcontentloaded', timeout = 45_000 } = {}) {
  const page = await session.context.newPage()
  let response = null
  let error = null
  try {
    response = await page.goto(url, { waitUntil, timeout })
  } catch (e) {
    error = e
  }
  return { page, response, error }
}

/** Visible text, through shadow roots (chrome:// pages are web components). */
export const VISIBLE_TEXT_FN = () => {
  const out = []
  const walk = (n) => {
    if (!n) return
    if (n.nodeType === 3) {
      const t = n.textContent.replace(/\s+/g, ' ').trim()
      if (!t) return
      const el = n.parentElement
      if (el && typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return
      out.push(t)
      return
    }
    if (n.nodeType === 1) {
      const tag = n.tagName
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE' || tag === 'NOSCRIPT') return
      if (n.shadowRoot) walk(n.shadowRoot)
    }
    for (const c of n.childNodes) walk(c)
  }
  walk(document.documentElement)
  return out.join('\n')
}

export async function visibleText(page) {
  return page.evaluate(VISIBLE_TEXT_FN)
}

/** Screenshot a page; bring it to front first (a background tab of a headed browser may not paint). */
export async function pageShot(page, file) {
  try {
    await page.bringToFront()
  } catch {}
  await sleep(500)
  await page.screenshot({ path: file, timeout: 30_000 })
  return file
}

/**
 * Quit the way a person does: close every window (WM_CLOSE), then wait for
 * every process that runs from the install dir to exit. Leftovers are killed
 * afterwards so the next session starts clean, and reported.
 */
export async function quit(session, { waitMs = 45_000 } = {}) {
  await disconnect(session)
  const before = appProcs()
  const close = closeAppWindows()
  const t0 = Date.now()
  let left = before
  while (Date.now() - t0 < waitMs) {
    await sleep(1500)
    left = appProcs()
    if (left.length === 0) break
  }
  const res = {
    windowsClosed: close?.closed ?? 0,
    closedTitles: close?.titles ?? [],
    procsBefore: before.map((p) => `${p.name}(${p.pid})`),
    // No process before the close means the browser was already gone: not a clean quit to measure.
    alreadyGone: before.length === 0,
    clean: before.length > 0 && left.length === 0,
    ms: Date.now() - t0,
    leftovers: left.map((p) => `${p.name}(${p.pid})`),
  }
  if (left.length) killAll()
  return res
}

/** Force-kill everything that runs from the install dir. */
export function killAll() {
  for (const p of appProcs()) {
    try {
      process.kill(p.pid)
    } catch {}
  }
}

export function extensionDirs(profile) {
  const d = path.join(profile, 'Default', 'Extensions')
  try {
    return fs.readdirSync(d)
  } catch {
    return []
  }
}

export function dirSize(dir) {
  let total = 0
  let files = 0
  const walk = (d) => {
    let ents = []
    try {
      ents = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of ents) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else {
        try {
          total += fs.statSync(p).size
          files++
        } catch {}
      }
    }
  }
  walk(dir)
  return { bytes: total, files }
}

/** Every file under a dir, relative paths. */
export function listTree(dir, max = 20_000) {
  const out = []
  const walk = (d, rel) => {
    let ents = []
    try {
      ents = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of ents) {
      if (out.length >= max) return
      const r = rel ? `${rel}\\${e.name}` : e.name
      if (e.isDirectory()) {
        out.push(`${r}\\`)
        walk(path.join(d, e.name), r)
      } else out.push(r)
    }
  }
  walk(dir, '')
  return out
}
