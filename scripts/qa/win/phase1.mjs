// Phase 1 of the Windows QA of the RELEASED Astro installer: everything that
// needs no sign-in. Runs on a GitHub windows-latest runner after
// o2-install.ps1 has installed Astro-Setup.exe. The browser runs HEADED on
// the runner's desktop (what a user gets).
//
// Sessions (each row writes results/windows/<ID>/result.json):
//   A  fresh profile p1     first start, self-test, browser basics, Web Store
//   B  profile p1 again     second start, bookmark persists, clean quit
//   C  Start-menu shortcut  default profile, no flags (the user path)
//   D  fresh profile p2     publikhq.com mapped to a dead port: unreachable gate
//   E  fresh profile p3     net-log + 3 min idle, then About page update check
//   then: binary URL scan, update addresses, brand rows.
//
// Later phases: put another script next to this one (import ./lib/*.mjs)
// and pass its name in the workflow_dispatch input "extra_scripts".
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as A from './lib/astro.mjs'
import { browserWsUrl, cdpConnect, evalInTarget, listTargets, screenshotTarget } from './lib/cdp.mjs'
import { parseNetLog, isLocal } from './lib/netlog.mjs'
import { findRenamedKeys, restoreRenamedKeys } from './lib/pak.mjs'
import { extStorageGet, extStorageRemove, extStorageSet, extensionWorker } from './lib/publik.mjs'
import { Blocked, blockedRow, brandHits, RESULTS, runRow, sleep, waitFor } from './lib/rows.mjs'
import { scanUrls, scanWord } from './lib/scan.mjs'
import {
  allWindows,
  appCmdlines,
  appErrors,
  appListen,
  appProcs,
  appWindows,
  desktopShot,
  dnsCache,
  dnsClear,
  INSTALL_DIR,
  lnkInfo,
  regDump,
  sendKeys,
  uiaClick,
  uiaDump,
  verInfo,
  winBackground,
} from './lib/win.mjs'

const TAG = process.env.RELEASE_TAG || 'v0.2.4'
const REPO = process.env.RELEASE_REPO || 'Blueturboguy07/Astro'
const EXPECT_AGENT = process.env.EXPECT_AGENT_VERSION || '0.0.103'
const SELFTEST_OK = `publik self-test: ok astro ${EXPECT_AGENT}`
const IDLE_MS = Number(process.env.QA_IDLE_MS || 180_000)
const SM_LNK = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs\\Astro\\Astro.lnk')
const DESK_LNK = path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop\\Astro.lnk')
const ARP_KEY = 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Astro'
const WEBSTORE_ID = 'ddkjiahejlhfcafbddmgiahcphecmpfh' // uBlock Origin Lite
const BOOKMARK_URL = 'https://en.wikipedia.org/wiki/Web_browser'
const DOWNLOAD_URL = `https://github.com/${REPO}/releases/download/${TAG}/SHA256SUMS.txt`

const SITES = [
  ['wikipedia', BOOKMARK_URL],
  ['github', `https://github.com/${REPO}`],
  ['youtube', 'https://www.youtube.com/'],
  ['bbc-news', 'https://www.bbc.com/news'],
  ['mdn', 'https://developer.mozilla.org/en-US/docs/Web/HTML'],
  ['apple', 'https://www.apple.com/'],
  ['nasa', 'https://www.nasa.gov/'],
  ['hacker-news', 'https://news.ycombinator.com/'],
]

fs.mkdirSync(A.WORK, { recursive: true })
fs.mkdirSync(RESULTS, { recursive: true })
process.on('unhandledRejection', (e) => console.log(`unhandled rejection (ignored): ${e?.stack ?? e}`))

/** What the brand rows read at the end. */
const brand = { windowTitles: [], procs: [], versionText: '', helpText: '', defaultUserData: null }
const recordWindows = (where) => {
  for (const w of appWindows()) if (w.title) brand.windowTitles.push({ where, title: w.title, class: w.class, process: w.name })
}
const quitText = (q) =>
  q.alreadyGone
    ? 'no Astro process was running when the quit started (the browser had already exited)'
    : `closed ${q.windowsClosed} window(s)${(q.closeRounds?.length ?? 1) > 1 ? `; windows opened again and were closed ${q.closeRounds.length - 1} more time(s): ${q.closeRounds.slice(1).map((r) => `${(r.atMs / 1000).toFixed(0)} s [${r.titles.join(', ')}]`).join(' ')}` : ''}; processes before: ${q.procsBefore.length}; ${q.clean ? `all gone in ${(q.ms / 1000).toFixed(1)} s` : `LEFT after ${(q.ms / 1000).toFixed(0)} s: ${q.leftovers.join(', ')}; windows left: ${(q.windowsLeft ?? []).join(' | ') || 'none'}`}`
const shotDesktop = (ctx, name) => {
  const r = desktopShot(ctx.file(name))
  if (r?.error) ctx.note(`desktop screenshot failed: ${r.error}`)
  return r
}

// =====================================================================
// Session A: first start of a fresh profile
// =====================================================================
const P1 = A.profilePath('p1')
let S = null
let bookmark = null
const NETLOG_A = path.join(A.WORK, 'netlog-a.json')
const CAP_A = { sample: path.join(A.WORK, 'tcp-a.jsonl'), stop: path.join(A.WORK, 'tcp-a.stop') }
let newTab = null // console/page errors of the new tab page (O3-W-03)

await runRow(
  {
    id: 'O2-W-06',
    title: 'First start (headed, fresh profile): managed ports in config.json',
    expected: 'chrome.exe --user-data-dir=<fresh> --no-first-run starts headed; <profile>\\.browseros\\config.json gets ports.cdp and ports.server within 120 s; CDP answers',
  },
  async (ctx) => {
    for (const f of [NETLOG_A, CAP_A.sample, CAP_A.stop]) fs.rmSync(f, { force: true })
    dnsClear()
    CAP_A.sampler = winBackground('netsample', { Out: CAP_A.sample, StopFile: CAP_A.stop })
    CAP_A.t0 = Date.now()
    S = await A.launch({ profile: P1, fresh: true, args: ['--enable-logging', '--v=0', `--log-net-log=${NETLOG_A}`, '--net-log-capture-mode=Default'] })
    ctx.writeJson('config.json', S.cfg)
    await sleep(4000)
    ctx.writeJson('windows.json', appWindows())
    shotDesktop(ctx, 'desktop-first-start.png')
    return {
      result: 'pass',
      actual: `config.json after ${(S.configMs / 1000).toFixed(1)} s: cdp=${S.cdp} server=${S.server} proxy=${S.cfg.ports.proxy}; browseros_version=${S.cfg.instance?.browseros_version} chromium=${S.cfg.instance?.chromium_version}`,
    }
  },
)

const needA = (def) => {
  if (!S) {
    blockedRow(def, 'first start failed (O2-W-06)')
    return false
  }
  return true
}

let D = { id: 'O2-W-07', title: 'First start: local server health', expected: 'GET http://127.0.0.1:<ports.server>/health answers 200 (also /system/health)' }
if (needA(D))
  await runRow(D, async (ctx) => {
    const h = await A.waitHealth(S.server)
    ctx.writeJson('health.json', h)
    return {
      result: h.ok ? 'pass' : 'fail',
      actual: `/health ${h.health?.status} ${String(h.health?.body ?? h.health?.error ?? '').slice(0, 160)}; /system/health ${h.systemHealth?.status} ${String(h.systemHealth?.body ?? '').slice(0, 160)}; waited ${(h.ms / 1000).toFixed(1)} s`,
    }
  })

const redact = (v, k = '') => {
  if (/key|token|secret|password|authorization|cookie/i.test(k) && typeof v === 'string') return `<redacted len=${v.length}>`
  if (Array.isArray(v)) return v.map((x) => redact(x))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([kk, vv]) => [kk, redact(vv, kk)]))
  return v
}
const shape = (v, depth = 0) => {
  if (Array.isArray(v)) return depth > 2 ? `array(${v.length})` : [`array(${v.length})`, ...(v.length ? [shape(v[0], depth + 1)] : [])]
  if (v && typeof v === 'object') return depth > 2 ? 'object' : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x, depth + 1)]))
  return typeof v
}
const SERVER_EXE = path.join(INSTALL_DIR, S?.cfg?.instance?.chromium_version ?? '', 'BrowserOSServer', 'default', 'resources', 'bin', 'browseros_server.exe')

D = {
  id: 'O7-W-01',
  title: 'Local server has the answer-engine API (/api/providers, /api/config)',
  expected: 'After first start, GET /api/providers and /api/config on the managed server port answer 200 JSON (as the macOS server does); /system/health 200; record the server version',
}
if (needA(D))
  await runRow(D, async (ctx) => {
    await A.waitHealth(S.server, 60_000)
    const paths = ['/api/providers', '/api/config', '/api/chats', '/system/health', '/health', '/status']
    const out = []
    for (const p of paths) {
      const r = await A.httpGet(`http://127.0.0.1:${S.server}${p}`, 15_000)
      let json = null
      try {
        json = JSON.parse(r.body)
      } catch {}
      out.push({ path: p, status: r.status, contentType: r.contentType, error: r.error, bodyShape: json ? shape(json) : null, body: json ? redact(json) : (r.body ?? '').slice(0, 500) })
    }
    ctx.writeJson('server-api.json', out)
    // Server version: the binary, the config instance block, and the logs.
    const { spawnSync } = await import('node:child_process')
    let exe = SERVER_EXE
    if (!fs.existsSync(exe)) {
      const hit = A.listTree(INSTALL_DIR).find((f) => /browseros_server\.exe$/i.test(f))
      exe = hit ? path.join(INSTALL_DIR, hit) : exe
    }
    const v = fs.existsSync(exe) ? spawnSync(exe, ['--version'], { encoding: 'utf8', timeout: 20_000, windowsHide: true }) : null
    const versionOut = v ? `${(v.stdout || '').trim()} ${(v.stderr || '').trim()}`.trim().slice(0, 300) : '(server exe not found)'
    const bros = path.join(P1, '.browseros')
    const tree = A.listTree(bros)
    const logs = tree.filter((f) => /\.log$/i.test(f)).slice(0, 5)
    const logTail = logs.map((f) => `== ${f}\n${fs.readFileSync(path.join(bros, f), 'utf8').split(/\r?\n/).slice(-80).join('\n')}`).join('\n')
    const dbg = fs.existsSync(path.join(P1, 'chrome_debug.log')) ? fs.readFileSync(path.join(P1, 'chrome_debug.log'), 'utf8').split(/\r?\n/).filter((l) => /browseros|server/i.test(l)).slice(-80).join('\n') : ''
    ctx.writeText('server-version.txt', `exe: ${exe}\n--version: ${versionOut}\nexit: ${v?.status}\nconfig.instance: ${JSON.stringify(S.cfg.instance)}\n.browseros tree:\n${tree.join('\n')}\n`)
    ctx.writeText('server-logs.txt', `${logTail}\n== chrome_debug.log (server lines)\n${dbg}`)
    const ok = (r) => r && r.status === 200 && r.bodyShape
    const prov = out.find((r) => r.path === '/api/providers')
    const conf = out.find((r) => r.path === '/api/config')
    const sys = out.find((r) => r.path === '/system/health')
    return {
      result: ok(prov) && ok(conf) && sys?.status === 200 ? 'pass' : 'fail',
      actual: out.map((r) => `${r.path} ${r.status || r.error}${r.bodyShape ? ` keys[${Object.keys(r.bodyShape).join(',')}]` : ` "${String(r.body).slice(0, 60)}"`}`).join('; ') + `; server --version: ${versionOut}; instance: ${JSON.stringify(S.cfg.instance)}`,
      details: out.map(({ body, ...rest }) => rest),
    }
  })

D = {
  id: 'O7-W-02',
  title: 'Local server, CDP and proxy listen on loopback only',
  expected: 'Every listening socket of chrome.exe / browseros_server.exe (cdp, server, proxy, MCP proxy) is bound to 127.0.0.1 or ::1, not 0.0.0.0 / ::, so the local network cannot reach them',
}
if (needA(D))
  await runRow(D, async (ctx) => {
    const ls = appListen()
    ctx.writeJson('listen.json', ls)
    // A program that listens on all interfaces makes Windows Defender Firewall ask a person to allow it.
    const fw = (allWindows() ?? []).filter((w) => /firewall|security alert/i.test(`${w.title} ${w.class}`))
    ctx.writeJson('firewall-windows.json', fw)
    const ports = new Map([[S.cdp, 'cdp'], [S.server, 'server'], [S.cfg.ports.proxy, 'proxy']])
    const open = ls.filter((l) => !/^(127\.|::1$)/.test(l.address))
    const fmt = (l) => `${l.name}:${l.address}:${l.port}${ports.has(l.port) ? `(${ports.get(l.port)})` : ''}`
    // Is a non-loopback socket reachable on the runner's own LAN address?
    const lan = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address
    const reach = []
    if (lan) for (const l of open.slice(0, 6)) reach.push({ port: l.port, url: `http://${lan}:${l.port}/`, ...(await A.httpGet(`http://${lan}:${l.port}/health`, 5000)) })
    ctx.writeJson('lan-reach.json', reach.map((r) => ({ port: r.port, url: r.url, status: r.status, error: r.error, body: String(r.body ?? '').slice(0, 200) })))
    return {
      result: ls.length && open.length === 0 ? 'pass' : ls.length ? 'fail' : 'blocked',
      actual: `listening: ${ls.map(fmt).join(', ') || 'none found'}; not loopback: ${open.map(fmt).join(', ') || 'none'}${reach.length ? `; from LAN address ${lan}: ${reach.map((r) => `${r.port} -> ${r.status || r.error}`).join(', ')}` : ''}; firewall prompt windows: ${fw.map((w) => `"${w.title}"`).join(', ') || 'none'}`,
    }
  })

D = { id: 'O2-W-08', title: 'First start: agent extension installed in the profile', expected: `Default\\Extensions\\${A.EXT_ID}\\${EXPECT_AGENT}_0 exists; no bug reporter (${A.BUGREPORTER_ID}) and no upstream agent id` }
if (needA(D))
  await runRow(D, async (ctx) => {
    await waitFor(() => A.extensionDirs(P1).includes(A.EXT_ID), { timeoutMs: 60_000, what: 'agent extension folder' }).catch(() => null)
    const dirs = A.extensionDirs(P1)
    const extRoot = path.join(P1, 'Default', 'Extensions', A.EXT_ID)
    const versions = fs.existsSync(extRoot) ? fs.readdirSync(extRoot) : []
    const manifest = versions[0] ? A.readJson(path.join(extRoot, versions[0], 'manifest.json')) : null
    ctx.writeJson('extensions.json', { dirs, versions, manifestVersion: manifest?.version, manifestName: manifest?.name })
    const ok = dirs.includes(A.EXT_ID) && !dirs.includes(A.BUGREPORTER_ID) && !dirs.includes(A.UPSTREAM_AGENT_ID) && manifest?.version === EXPECT_AGENT
    return { result: ok ? 'pass' : 'fail', actual: `Extensions: [${dirs.join(', ')}]; agent versions [${versions.join(', ')}]; manifest ${manifest?.name ?? '?'} ${manifest?.version ?? '?'}` }
  })

D = { id: 'O2-W-09', title: 'First start: the gate takes the first tab', expected: 'Exactly one tab; it is app.html#/home and shows "Sign in with publik" with a Sign in with publik button (no second stock new tab)' }
if (needA(D))
  await runRow(D, async (ctx) => {
    await A.waitGateTab(S.cdp, 90_000)
    await sleep(4000)
    const targets = await listTargets(S.cdp)
    ctx.writeJson('targets.json', targets.map((t) => ({ type: t.type, url: t.url, title: t.title })))
    const tabs = targets.filter((t) => t.type === 'page')
    await A.connect(S)
    const gate = await A.findPage(S, A.APP_URL)
    await gate.getByRole('button', { name: /Sign in with publik|Retry/ }).first().waitFor({ timeout: 60_000 }).catch(() => null)
    const text = await A.visibleText(gate)
    ctx.writeText('gate-text.txt', text)
    await A.pageShot(gate, ctx.file('gate.png'))
    shotDesktop(ctx, 'desktop.png')
    recordWindows('first start')
    const hasButton = (await gate.getByRole('button', { name: 'Sign in with publik' }).count()) > 0
    const ok = tabs.length === 1 && tabs[0].url.startsWith(A.APP_URL) && /Sign in with publik/.test(text) && hasButton
    return {
      result: ok ? 'pass' : 'fail',
      actual: `${tabs.length} tab(s): ${tabs.map((t) => t.url).join(' , ')}; button "Sign in with publik": ${hasButton}; text: ${text.replace(/\n/g, ' / ').slice(0, 300)}`,
    }
  })

D = { id: 'O3-W-01', title: 'Self-test page prints ok', expected: `app.html#/publik/self-test shows "${SELFTEST_OK}" in <pre id="publik-self-test"> and in document.title` }
if (needA(D))
  await runRow(D, async (ctx) => {
    if (!S.browser) await A.connect(S)
    const { page } = await A.openPage(S, A.SELFTEST_URL)
    await page
      .waitForFunction(() => (document.querySelector('#publik-self-test')?.textContent || '').startsWith('publik self-test:'), null, { timeout: 60_000 })
      .catch(() => null)
    const line = (await page.$eval('#publik-self-test', (e) => e.textContent).catch(() => '')) || ''
    const title = await page.title()
    ctx.writeText('self-test.txt', `pre: ${line}\ntitle: ${title}\n`)
    await A.pageShot(page, ctx.file('self-test.png'))
    await page.close().catch(() => null)
    return { result: line === SELFTEST_OK && title === SELFTEST_OK ? 'pass' : 'fail', actual: `pre="${line}" title="${title}"` }
  })

// New tab page: console errors, page errors and failed requests (O3-W-03 reads this after the quit).
if (S)
  try {
    if (!S.browser) await A.connect(S)
    const page = await S.context.newPage()
    const ev = { console: [], pageErrors: [], failed: [], http4xx5xx: [] }
    page.on('console', (m) => {
      if (['error', 'warning'].includes(m.type())) ev.console.push({ type: m.type(), text: m.text().slice(0, 400), url: m.location()?.url })
    })
    page.on('pageerror', (e) => ev.pageErrors.push(String(e?.message ?? e).slice(0, 400)))
    page.on('requestfailed', (r) => ev.failed.push({ url: r.url().slice(0, 200), error: r.failure()?.errorText }))
    page.on('response', (r) => {
      if (r.status() >= 400) ev.http4xx5xx.push({ url: r.url().slice(0, 200), status: r.status() })
    })
    const t0 = Date.now()
    await page.goto('chrome://newtab/', { timeout: 30_000 }).catch((e) => ev.pageErrors.push(`goto: ${e.message.split('\n')[0]}`))
    await sleep(10_000)
    ev.finalUrl = page.url()
    ev.title = await page.title().catch(() => '')
    ev.text = (await A.visibleText(page).catch(() => '')).slice(0, 1500)
    ev.ms = Date.now() - t0
    ev.shot = path.join(A.WORK, 'newtab.png')
    await A.pageShot(page, ev.shot).catch(() => null)
    // The same page by its own URL.
    const p2 = await S.context.newPage()
    const ev2 = { console: [], pageErrors: [] }
    p2.on('console', (m) => {
      if (['error', 'warning'].includes(m.type())) ev2.console.push({ type: m.type(), text: m.text().slice(0, 400) })
    })
    p2.on('pageerror', (e) => ev2.pageErrors.push(String(e?.message ?? e).slice(0, 400)))
    await p2.goto(A.GATE_URL, { timeout: 30_000 }).catch((e) => ev2.pageErrors.push(`goto: ${e.message.split('\n')[0]}`))
    await sleep(8000)
    ev.appHome = ev2
    await p2.close().catch(() => null)
    await page.close().catch(() => null)
    newTab = ev
  } catch (e) {
    newTab = { error: e.message }
  }
CAP_A.tStartEnd = Date.now() // "at start" ends here; browsing starts after the harness check

D = {
  id: 'QA-W-H01',
  title: 'Harness: write/read chrome.storage.local through the agent service worker (for signed-in phases)',
  expected: 'A probe key written through the service-worker CDP target reads back and is removed',
}
if (needA(D))
  await runRow(D, async (ctx) => {
    if (!S.browser) await A.connect(S)
    const sw = await extensionWorker(S)
    const probe = { at: Date.now(), by: 'qa-harness' }
    await extStorageSet(S, { 'qa-harness-probe': probe })
    const back = await extStorageGet(S, ['qa-harness-probe'])
    await extStorageRemove(S, ['qa-harness-probe'])
    // Key NAMES only: the values hold this install's publik key.
    const keys = await evalInTarget(sw.webSocketDebuggerUrl, 'chrome.storage.local.get(null).then(o => Object.keys(o).sort())')
    ctx.writeJson('storage-keys.json', { worker: sw.url, keys })
    const ok = back?.['qa-harness-probe']?.at === probe.at
    return { result: ok ? 'pass' : 'fail', actual: `worker ${sw.url}; probe read back: ${ok}; storage keys: ${keys.join(', ')}` }
  })

// ---------------- O8 browser basics (session A) ----------------
let sitePage = null
D = { id: 'O8-W-01', title: 'Load 8 varied real sites', expected: 'Each site answers < 400 with a page title; screenshot of each' }
if (needA(D))
  await runRow(
    { ...D, timeoutMs: 600_000 },
    async (ctx) => {
      if (!S.browser) await A.connect(S)
      sitePage = await S.context.newPage()
      const rows = []
      let i = 0
      for (const [name, url] of SITES) {
        i++
        const t0 = Date.now()
        const r = { name, url, status: 0, title: '', ms: 0, error: null }
        try {
          const resp = await sitePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
          r.status = resp?.status() ?? 0
          await sitePage.waitForLoadState('load', { timeout: 20_000 }).catch(() => null)
          r.title = await sitePage.title()
        } catch (e) {
          r.error = String(e.message).split('\n')[0]
        }
        r.ms = Date.now() - t0
        r.finalUrl = sitePage.url()
        await A.pageShot(sitePage, ctx.file(`site-${i}-${name}.png`)).catch((e) => (r.shotError = e.message))
        rows.push(r)
      }
      ctx.writeJson('sites.json', rows)
      recordWindows('browsing')
      const bad = rows.filter((r) => !(r.status > 0 && r.status < 400 && r.title))
      return {
        result: bad.length === 0 ? 'pass' : 'fail',
        actual: rows.map((r) => `${r.name} ${r.status || r.error} "${r.title.slice(0, 40)}" ${(r.ms / 1000).toFixed(1)}s`).join('; '),
        details: rows,
      }
    },
  )

D = { id: 'O8-W-02', title: 'Download a file', expected: `Opening ${DOWNLOAD_URL} saves SHA256SUMS.txt to the user's Downloads folder with the right content; chrome://downloads lists it` }
if (needA(D))
  await runRow(D, async (ctx) => {
    if (!S.browser) await A.connect(S)
    // Playwright routes downloads to its own temp dir; give the browser back its default behaviour.
    const bs = await S.browser.newBrowserCDPSession()
    await bs.send('Browser.setDownloadBehavior', { behavior: 'default' })
    const dlDir = path.join(os.homedir(), 'Downloads')
    const before = new Set(fs.existsSync(dlDir) ? fs.readdirSync(dlDir) : [])
    const page = sitePage ?? (await S.context.newPage())
    await page.goto(DOWNLOAD_URL, { timeout: 30_000 }).catch(() => null)
    const file = await waitFor(
      () => {
        if (!fs.existsSync(dlDir)) return null
        const f = fs.readdirSync(dlDir).find((n) => !before.has(n) && /^SHA256SUMS.*\.txt$/i.test(n))
        return f ? path.join(dlDir, f) : null
      },
      { timeoutMs: 60_000, what: 'SHA256SUMS*.txt in Downloads' },
    ).catch(() => null)
    const want = fs.existsSync(path.join(A.WORK, 'dl', 'SHA256SUMS.txt')) ? fs.readFileSync(path.join(A.WORK, 'dl', 'SHA256SUMS.txt'), 'utf8') : null
    const got = file ? fs.readFileSync(file, 'utf8') : null
    const { page: dp } = await A.openPage(S, 'chrome://downloads')
    await sleep(2000)
    const text = await A.visibleText(dp)
    ctx.writeText('downloads-page.txt', text)
    await A.pageShot(dp, ctx.file('chrome-downloads.png'))
    await dp.close().catch(() => null)
    const titles = allWindows().map((w) => w.title)
    if (titles.some((t) => /save as/i.test(t))) ctx.note('a Save As dialog is open')
    const listed = /SHA256SUMS/.test(text)
    const ok = Boolean(file) && (want === null || got === want) && listed
    return {
      result: ok ? 'pass' : 'fail',
      actual: `file: ${file ?? 'NOT in ' + dlDir}; content matches release file: ${want === null ? 'n/a' : got === want}; chrome://downloads lists it: ${listed}`,
    }
  })

D = { id: 'O8-W-03a', title: 'Add a bookmark (Ctrl+D on a page)', expected: 'Ctrl+D then Enter on the Wikipedia page adds a bookmark that chrome.bookmarks can find' }
if (needA(D))
  await runRow(D, async (ctx) => {
    if (!S.browser) await A.connect(S)
    const page = sitePage ?? (await S.context.newPage())
    await page.goto(BOOKMARK_URL, { timeout: 45_000 }).catch(() => null)
    await page.bringToFront()
    await sleep(1000)
    const k1 = sendKeys('^d')
    await sleep(2000)
    shotDesktop(ctx, 'bookmark-bubble.png')
    const k2 = sendKeys('{ENTER}')
    await sleep(1500)
    const sw = await extensionWorker(S)
    const find = () => evalInTarget(sw.webSocketDebuggerUrl, `chrome.bookmarks.search({ url: ${JSON.stringify(BOOKMARK_URL)} }).then(r => r.map(b => ({ id: b.id, title: b.title, url: b.url, parentId: b.parentId })))`)
    let hits = await find()
    let method = 'Ctrl+D (real keyboard input on the runner desktop)'
    if (!hits.length) {
      method = 'chrome.bookmarks.create fallback (Ctrl+D did not add one)'
      await evalInTarget(sw.webSocketDebuggerUrl, `chrome.bookmarks.create({ parentId: '1', title: 'Web browser - Wikipedia', url: ${JSON.stringify(BOOKMARK_URL)} }).then(() => true)`)
      hits = await find()
    }
    bookmark = { url: BOOKMARK_URL, method, hits }
    ctx.writeJson('bookmark.json', { keys: [k1, k2], bookmark })
    return {
      result: hits.length && method.startsWith('Ctrl+D') ? 'pass' : hits.length ? 'blocked' : 'fail',
      actual: `${hits.length} bookmark(s) for ${BOOKMARK_URL} via ${method}; keys: ${JSON.stringify(k1).slice(0, 160)}`,
      notes: method.startsWith('Ctrl+D') ? '' : 'Keyboard input did not reach the bookmark bubble; persistence (O8-W-03) is still tested with the API-made bookmark.',
    }
  })

D = { id: 'O8-W-04', title: 'chrome://history lists visited pages', expected: 'chrome://history shows the hosts of the sites loaded in O8-W-01' }
if (needA(D))
  await runRow(D, async (ctx) => {
    if (!S.browser) await A.connect(S)
    const { page } = await A.openPage(S, 'chrome://history')
    await sleep(3000)
    const text = await A.visibleText(page)
    ctx.writeText('history-text.txt', text)
    await A.pageShot(page, ctx.file('history.png'))
    await page.close().catch(() => null)
    const hosts = SITES.map(([, u]) => new URL(u).hostname)
    const found = hosts.filter((h) => text.includes(h) || text.includes(h.replace(/^www\./, '')))
    return { result: found.length >= 5 ? 'pass' : 'fail', actual: `${found.length}/${hosts.length} hosts listed: ${found.join(', ')}` }
  })

D = { id: 'O8-W-05', title: 'Incognito window loads a page', expected: 'chrome.exe --incognito https://example.com/ (same profile) opens an incognito window in a separate browser context that loads "Example Domain"' }
if (needA(D))
  await runRow(D, async (ctx) => {
    if (!S.browser) await A.connect(S)
    const child = spawn(A.ASTRO_EXE, [`--user-data-dir=${P1}`, '--incognito', 'https://example.com/'], { detached: true, stdio: 'ignore' })
    child.unref()
    const bs = await S.browser.newBrowserCDPSession()
    const target = await waitFor(
      async () => {
        const { targetInfos } = await bs.send('Target.getTargets')
        return targetInfos.find((t) => t.type === 'page' && t.url.startsWith('https://example.com'))
      },
      { timeoutMs: 45_000, what: 'example.com tab' },
    )
    await sleep(4000)
    const { targetInfos } = await bs.send('Target.getTargets')
    const normal = targetInfos.find((t) => t.type === 'page' && t.url.startsWith(A.APP_URL))
    const it = targetInfos.find((t) => t.targetId === target.targetId) ?? target
    const listed = (await listTargets(S.cdp)).find((t) => t.id === target.targetId)
    if (listed?.webSocketDebuggerUrl) {
      fs.writeFileSync(ctx.file('incognito-page.png'), await screenshotTarget(listed.webSocketDebuggerUrl))
    }
    shotDesktop(ctx, 'desktop-incognito.png')
    const wins = appWindows()
    recordWindows('incognito')
    ctx.writeJson('incognito.json', { target: it, normalContext: normal?.browserContextId, windows: wins })
    const separate = Boolean(normal && it.browserContextId && it.browserContextId !== normal.browserContextId)
    await bs.send('Target.closeTarget', { targetId: target.targetId }).catch(() => null)
    return {
      result: separate && /Example Domain/.test(it.title) ? 'pass' : 'fail',
      actual: `tab "${it.title}" context ${it.browserContextId} vs normal ${normal?.browserContextId}; windows: ${wins.map((w) => w.title).join(' | ')}`,
    }
  })

// chrome://settings reads the default engine through its private API; no DOM walk needed.
const SEARCH_ENGINES_EXPR = `(async () => {
  const api = globalThis.chrome && chrome.searchEnginesPrivate
  if (!api) return { api: false }
  const x = await new Promise((res) => { const p = api.getSearchEngines(res); if (p && p.then) p.then(res) })
  const all = [...(x.defaults || []), ...(x.actives || []), ...(x.others || [])]
  return { api: true, count: all.length, defaults: all.filter((e) => e.default).map((e) => ({ name: e.name, keyword: e.keyword, url: e.url })) }
})()`
const settingsProbes = {}

D = { id: 'O8-W-06', title: 'Default search engine', expected: 'chrome://settings/search names a default engine; a query typed in the address bar (Ctrl+L, text, Enter) opens that engine' }
if (needA(D))
  await runRow(D, async (ctx) => {
    if (!S.browser) await A.connect(S)
    const dumps0 = A.crashDumps(P1).length
    const probe = await A.cdpPageProbe(S.cdp, 'chrome://settings/search', { waitMs: 5000, shotFile: ctx.file('settings-search.png'), extra: SEARCH_ENGINES_EXPR, walk: false })
    settingsProbes.searchNoWalk = probe
    ctx.writeJson('settings-search-probe.json', { ...probe, dumpsBefore: dumps0, dumpsAfter: A.crashDumps(P1).length })
    const def = probe.extra?.defaults?.[0]
    const engine = def ? `${def.name} (${def.url})` : probe.crashed ? `(settings page crashed during ${probe.crashPhase})` : '(not found)'
    // Address bar: a blank tab, Ctrl+L, a query, Enter (real keyboard input).
    const { page } = await A.openPage(S, 'about:blank')
    await page.bringToFront()
    await sleep(800)
    const k = sendKeys('^l')
    await sleep(700)
    sendKeys('astro qa search test{ENTER}')
    const url = await waitFor(() => (/^https?:/.test(page.url()) ? page.url() : null), { timeoutMs: 20_000, what: 'search navigation' }).catch(() => null)
    if (url) await A.pageShot(page, ctx.file('omnibox-search.png')).catch(() => null)
    await page.close().catch(() => null)
    const host = url ? new URL(url).hostname : null
    ctx.writeJson('search.json', { engine: def ?? null, omniboxUrl: url, keys: k })
    const matches = Boolean(host && def?.url && new URL(def.url.replace('{searchTerms}', 'x').replace(/\{[^}]*\}/g, '')).hostname === host)
    if (!url) return { result: 'fail', actual: `settings: ${engine}; address-bar query did not navigate (keyboard ${k?.ok ? 'sent' : 'not sent'})` }
    return {
      result: def ? (matches ? 'pass' : 'fail') : 'pass',
      actual: `settings default: ${engine}; address-bar query went to ${host} (${url.slice(0, 120)})${def && !matches ? ' - not the settings default' : ''}`,
      notes: def ? '' : 'default engine name not read (see O8-W-09 for the settings page state); the address-bar query shows the engine in use',
    }
  })

D = { id: 'O8-W-07', title: 'chrome://version', expected: 'chrome://version opens; record its text (product line, Chromium version, executable path)' }
if (needA(D))
  await runRow(D, async (ctx) => {
    if (!S.browser) await A.connect(S)
    const { page } = await A.openPage(S, 'chrome://version')
    await sleep(1500)
    const text = await page.evaluate(() => document.body.innerText)
    brand.versionText = text
    ctx.writeText('chrome-version.txt', text)
    await A.pageShot(page, ctx.file('chrome-version.png'))
    await page.close().catch(() => null)
    const exeOk = text.toLowerCase().includes(A.ASTRO_EXE.toLowerCase())
    return { result: text.length > 50 && exeOk ? 'pass' : 'fail', actual: text.split('\n').filter(Boolean).slice(0, 6).join(' / ').slice(0, 400) + `; executable path is ${A.ASTRO_EXE}: ${exeOk}` }
  })

D = {
  id: 'O8-W-09',
  title: 'Settings pages open without a renderer crash',
  expected: 'chrome://settings, chrome://settings/search and chrome://settings/help open and stay open (no "Aw, Snap!", no Crashpad dump); reading their text does not crash them',
}
if (needA(D))
  await runRow(D, async (ctx) => {
    const dumps0 = A.crashDumps(P1)
    const plain = []
    for (const [i, u] of ['chrome://settings', 'chrome://settings/help'].entries()) {
      plain.push(await A.cdpPageProbe(S.cdp, u, { waitMs: 6000, shotFile: ctx.file(`settings-${i}.png`), walk: false }))
    }
    if (settingsProbes.searchNoWalk) plain.push(settingsProbes.searchNoWalk)
    // Same page again, now with the shadow-DOM text walk the harness uses elsewhere.
    const walked = await A.cdpPageProbe(S.cdp, 'chrome://settings/search', { waitMs: 5000, shotFile: ctx.file('settings-search-walk.png'), walk: true })
    // A crashed tab as a person sees it: bring one up and shoot the desktop.
    const crashedUrl = [...plain, walked].find((p) => p.crashed)?.url
    if (crashedUrl) {
      const p = await A.cdpPageProbe(S.cdp, crashedUrl, { waitMs: 6000, walk: false, keepOpen: true })
      await sleep(1500)
      shotDesktop(ctx, 'desktop-crashed-settings.png')
      if (p.targetId) {
        const { ws } = await browserWsUrl(S.cdp)
        const bs = await cdpConnect(ws)
        await bs.send('Target.closeTarget', { targetId: p.targetId }).catch(() => null)
        bs.close()
      }
    }
    const dumps1 = A.crashDumps(P1)
    const dbg = fs.existsSync(path.join(P1, 'chrome_debug.log'))
      ? fs.readFileSync(path.join(P1, 'chrome_debug.log'), 'utf8').split(/\r?\n/).filter((l) => /crash|renderer|sad tab|exit_code|terminated|RenderProcessGone/i.test(l)).slice(-60).join('\n')
      : ''
    ctx.writeJson('probes.json', { plain, walked, dumpsBefore: dumps0, dumpsAfter: dumps1 })
    ctx.writeText('debug-log-crash-lines.txt', dbg)
    const plainCrash = plain.filter((p) => p.crashed)
    const walkCrash = walked.crashed
    return {
      result: plainCrash.length === 0 && !walkCrash ? 'pass' : 'fail',
      actual: `${plain.map(A.probeText).join(' ; ')} ; with text walk: ${A.probeText(walked)}; Crashpad dumps ${dumps0.length} -> ${dumps1.length}`,
      notes: plainCrash.length ? 'the page crashes on its own, before any harness script runs' : walkCrash ? 'the page loads; it crashes only when a script walks its DOM (shadow roots + checkVisibility); a person does not hit this, a page script or extension can' : '',
    }
  })

D = { id: 'O8-W-08', title: 'Install an extension from the Chrome Web Store', expected: 'Web Store "Add to Chrome" then "Add extension" in the native dialog installs uBlock Origin Lite into the profile' }
if (needA(D))
  await runRow(
    { ...D, timeoutMs: 300_000 },
    async (ctx) => {
      if (!S.browser) await A.connect(S)
      const page = await S.context.newPage()
      await page.goto(`https://chromewebstore.google.com/detail/${WEBSTORE_ID}`, { timeout: 60_000 }).catch(() => null)
      await page.waitForLoadState('load', { timeout: 20_000 }).catch(() => null)
      await sleep(3000)
      await A.pageShot(page, ctx.file('store.png'))
      const btn = page.getByRole('button', { name: /^(Add to|Get)\b/i })
      if (!(await btn.count())) {
        const t = await A.visibleText(page)
        ctx.writeText('store-text.txt', t)
        throw new Blocked(`no "Add to ..." button on the store page (text: ${t.replace(/\n/g, ' / ').slice(0, 200)})`)
      }
      const label = (await btn.first().innerText()).trim()
      await btn.first().click()
      await sleep(3000)
      shotDesktop(ctx, 'dialog.png')
      ctx.writeJson('uia-dialog.json', uiaDump())
      let click = uiaClick('Add extension', 20)
      if (!click?.ok) {
        ctx.note(`UIA: ${click?.error}`)
        const k = sendKeys('{ENTER}')
        click = { ok: false, how: 'Enter key', k }
      }
      const installed = await waitFor(() => A.extensionDirs(P1).includes(WEBSTORE_ID), { timeoutMs: 90_000, what: 'web store extension folder' }).catch(() => false)
      await sleep(2000)
      shotDesktop(ctx, 'after.png')
      await page.close().catch(() => null)
      ctx.writeJson('install.json', { button: label, click, installed, extensions: A.extensionDirs(P1) })
      if (!installed) {
        return { result: click.ok ? 'fail' : 'blocked', actual: `clicked "${label}"; native dialog press: ${JSON.stringify(click).slice(0, 200)}; extension not installed within 90 s` }
      }
      return { result: 'pass', actual: `clicked "${label}", then "Add extension" (${click.how}); ${WEBSTORE_ID} installed` }
    },
  )

// Process names + window titles while A runs (brand rows read these later).
if (S) {
  brand.procs = appProcs()
  recordWindows('session A end')
}

D = { id: 'O2-W-10', title: 'Clean quit after the first session', expected: 'Closing every window ends all chrome.exe / browseros_server.exe processes within 45 s' }
if (needA(D))
  await runRow(D, async (ctx) => {
    const q = await A.quit(S)
    ctx.writeJson('quit.json', q)
    return { result: q.clean ? 'pass' : 'fail', actual: quitText(q) }
  })
A.killAll()
let NET_A = null
try {
  fs.writeFileSync(CAP_A.stop, '')
  if (CAP_A.sampler)
    await new Promise((r) => {
      CAP_A.sampler.on('exit', r)
      setTimeout(r, 15_000)
    })
  CAP_A.dns = dnsCache()
  CAP_A.tcp = fs.existsSync(CAP_A.sample)
    ? fs.readFileSync(CAP_A.sample, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    : []
  if (fs.existsSync(NETLOG_A)) NET_A = parseNetLog(NETLOG_A, { splitAt: CAP_A.tStartEnd ?? Date.now() })
} catch (e) {
  console.log(`session A capture failed: ${e.message}`)
}

await runRow(
  {
    id: 'O3-W-03',
    title: 'New tab page loads without console errors; hosts contacted at start',
    expected: 'chrome://newtab (and app.html#/home) render the gate with no console errors, page errors or failed requests; record every host the browser and its server contact from launch to the end of the start checks',
  },
  async (ctx) => {
    if (!newTab) throw new Blocked('first start failed (O2-W-06)')
    if (newTab.error) throw new Error(`new tab check failed: ${newTab.error}`)
    if (newTab.shot && fs.existsSync(newTab.shot)) fs.copyFileSync(newTab.shot, ctx.file('newtab.png'))
    const { shot, ...rest } = newTab
    ctx.writeJson('newtab-console.json', rest)
    const startHosts = NET_A ? NET_A.hosts.filter((h) => h.phases.includes('idle') && !h.local) : []
    const tcp = tcpHostsFrom(CAP_A.tcp ?? [], CAP_A.dns ?? [], CAP_A.tStartEnd ?? Date.now()).filter((t) => t.phase === 'idle')
    ctx.writeJson('hosts-at-start.json', { browser: startHosts, tcpByProcess: tcp, startWindowMs: (CAP_A.tStartEnd ?? 0) - (CAP_A.t0 ?? 0) })
    if (NET_A) ctx.writeJson('requests-at-start.json', NET_A.requests.filter((r) => r.phase === 'idle'))
    const errors = [...newTab.console.filter((c) => c.type === 'error'), ...newTab.pageErrors, ...newTab.appHome.console.filter((c) => c.type === 'error'), ...newTab.appHome.pageErrors]
    const failed = [...newTab.failed, ...newTab.http4xx5xx]
    const hostNames = [...new Set([...startHosts.map((h) => h.host), ...tcp.flatMap((t) => (t.names.length ? t.names : [t.remote]))])]
    return {
      result: errors.length === 0 && failed.length === 0 ? 'pass' : 'fail',
      actual: `new tab -> ${newTab.finalUrl} "${newTab.title}"; console errors ${errors.length}${errors.length ? `: ${JSON.stringify(errors).slice(0, 300)}` : ''}; failed/4xx requests ${failed.length}${failed.length ? `: ${JSON.stringify(failed).slice(0, 200)}` : ''}; hosts at start (${hostNames.length}): ${hostNames.join(', ')}`,
      notes: `console warnings: ${newTab.console.filter((c) => c.type === 'warning').length}. Server-process TCP: ${tcp.filter((t) => !/^chrome$/i.test(t.process)).map((t) => `${t.process}->${t.names[0] ?? t.remote}`).join(', ') || 'none'}`,
    }
  },
)

// =====================================================================
// Session B: second start of the same profile
// =====================================================================
let S2 = null
await runRow(
  { id: 'O2-W-11', title: 'Second start of the same profile', expected: 'Profile p1 starts again: new ports in config.json, /health 200, an app tab with the gate, no crash' },
  async (ctx) => {
    if (!fs.existsSync(P1)) throw new Blocked('profile p1 does not exist (first start failed)')
    const dumps0 = A.crashDumps(P1)
    S2 = await A.launch({ profile: P1, args: ['--enable-logging', '--v=0'] })
    const h = await A.waitHealth(S2.server)
    const gateT = await A.waitGateTab(S2.cdp, 60_000).catch(() => null)
    await sleep(4000)
    const targets = await listTargets(S2.cdp)
    ctx.writeJson('targets.json', targets.map((t) => ({ type: t.type, url: t.url, title: t.title })))
    // Raw CDP for the checks (no Playwright attach to every restored tab).
    const gate = targets.find((t) => t.type === 'page' && t.url.startsWith(A.APP_URL))
    let text = ''
    if (gate) {
      text = await waitFor(async () => {
        const t = await evalInTarget(gate.webSocketDebuggerUrl, `(${A.VISIBLE_TEXT_FN.toString()})()`).catch(() => '')
        return /Sign in with publik|Retry/.test(t) ? t : null
      }, { timeoutMs: 30_000, what: 'gate text' }).catch(() => '')
      const png = await screenshotTarget(gate.webSocketDebuggerUrl).catch(() => null)
      if (png) fs.writeFileSync(ctx.file('gate-second-start.png'), png)
    }
    shotDesktop(ctx, 'desktop-second-start.png')
    recordWindows('second start')
    // Diagnostic: can Playwright attach to this browser (it attaches to every target)?
    let pw = 'ok'
    try {
      await A.connect(S2, { timeout: 30_000 })
    } catch (e) {
      pw = `failed: ${e.message.split('\n')[0]}`
      S2.browser = null
      S2.context = null
    }
    const dumps1 = A.crashDumps(P1)
    const ok = h.ok && Boolean(gate) && /Sign in with publik/.test(text)
    return {
      result: ok ? 'pass' : 'fail',
      actual: `config after ${(S2.configMs / 1000).toFixed(1)} s (cdp=${S2.cdp} server=${S2.server}); /health ${h.health?.status}; restored tabs: ${targets.filter((t) => t.type === 'page').map((t) => t.url).join(' , ')}; gate text: ${text.replace(/\n/g, ' / ').slice(0, 160)}; Crashpad dumps ${dumps0.length} -> ${dumps1.length}`,
      notes: `Playwright connectOverCDP (harness only): ${pw}${gateT ? '' : '; gate tab did not appear in 60 s'}`,
    }
  },
)

D = { id: 'O8-W-03', title: 'Bookmark persists across restart', expected: `After quit and second start, the bookmark for ${BOOKMARK_URL} is in chrome://bookmarks and in Default\\Bookmarks` }
if (!S2 || !bookmark) blockedRow(D, !S2 ? 'second start failed (O2-W-11)' : 'no bookmark was added (O8-W-03a)')
else
  await runRow(D, async (ctx) => {
    const file = A.readJson(path.join(P1, 'Default', 'Bookmarks'))
    const onDisk = JSON.stringify(file ?? {}).includes(BOOKMARK_URL)
    const probe = await A.cdpPageProbe(S2.cdp, 'chrome://bookmarks/?q=Web%20browser', {
      waitMs: 3000,
      shotFile: ctx.file('chrome-bookmarks.png'),
      extra: `new Promise((r) => chrome.bookmarks.search('Web browser', r)).then((x) => x.map((b) => ({ title: b.title, url: b.url })))`,
      walk: false,
    })
    ctx.writeJson('bookmarks-probe.json', probe)
    const listed = (probe.extra ?? []).filter((b) => b.url === BOOKMARK_URL)
    const shown = listed.length > 0
    return {
      result: onDisk && shown ? 'pass' : 'fail',
      actual: `in Default\\Bookmarks: ${onDisk}; chrome://bookmarks lists it: ${shown} (${listed.map((b) => b.title).join(', ')}); added via ${bookmark.method}${probe.crashed ? `; bookmarks page CRASHED during ${probe.crashPhase}` : ''}`,
    }
  })

D = { id: 'O2-W-12', title: 'Clean quit after the second start', expected: 'Closing every window ends all chrome.exe / browseros_server.exe processes within 45 s' }
if (!S2) blockedRow(D, 'second start failed (O2-W-11)')
else
  await runRow(D, async (ctx) => {
    const q = await A.quit(S2)
    ctx.writeJson('quit.json', q)
    return { result: q.clean ? 'pass' : 'fail', actual: quitText(q) }
  })
A.killAll()

// =====================================================================
// Session C: the user path — Start-menu shortcut, default profile, no flags
// =====================================================================
function findDefaultConfig(since) {
  const la = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  const cands = [path.join(os.homedir(), '.browseros', 'config.json')]
  for (const d of fs.existsSync(la) ? fs.readdirSync(la) : []) {
    cands.push(path.join(la, d, 'User Data', '.browseros', 'config.json'))
    cands.push(path.join(la, d, '.browseros', 'config.json'))
  }
  for (const c of cands) {
    try {
      if (fs.statSync(c).mtimeMs >= since - 2000) {
        const j = A.readJson(c)
        if (j?.ports?.cdp && j?.ports?.server) return { file: c, cfg: j }
      }
    } catch {}
  }
  return null
}

await runRow(
  {
    id: 'O2-W-13',
    title: 'Start from the Start-menu shortcut (default profile, no flags)',
    expected: 'Opening Start menu > Astro starts the browser with the default user data dir; its .browseros\\config.json appears, /health 200, a window opens; it closes cleanly',
    timeoutMs: 300_000,
  },
  async (ctx) => {
    if (!fs.existsSync(SM_LNK)) throw new Blocked(`no Start-menu shortcut at ${SM_LNK}`)
    const la = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
    const snapshot = (label) => ({
      label,
      procs: appCmdlines().map((p) => ({ ...p, cmd: p.cmd.slice(0, 400) })),
      windows: appWindows(),
      userDataDirs: (fs.existsSync(la) ? fs.readdirSync(la) : []).filter((d) => fs.existsSync(path.join(la, d, 'User Data'))),
    })
    const diag = { attempts: [] }
    // Attempt 1: the shortcut through the shell, the way a double-click opens it.
    let t0 = Date.now()
    spawn('explorer.exe', [SM_LNK], { detached: true, stdio: 'ignore' }).unref()
    let found = await waitFor(() => findDefaultConfig(t0), { timeoutMs: 45_000, what: 'config.json of the default profile' }).catch(() => null)
    diag.attempts.push({ how: 'explorer.exe <Start-menu .lnk>', configFound: Boolean(found), ...snapshot('45 s after the shortcut') })
    let how = 'Start-menu shortcut (explorer.exe)'
    if (!found) {
      shotDesktop(ctx, 'desktop-shortcut-45s.png')
      diag.uia = uiaDump()
      for (const name of ["Don't sign in", 'Stay signed out', 'Continue without an account', 'No thanks', 'Not now', 'Skip']) {
        const r = uiaClick(name, 2)
        if (r?.ok) {
          diag.clicked = { name, ...r }
          break
        }
      }
      found = await waitFor(() => findDefaultConfig(t0), { timeoutMs: 15_000, what: 'config.json of the default profile' }).catch(() => null)
    }
    if (!found) {
      // Attempt 2: chrome.exe itself, no profile flag (the shortcut's own target), with logging.
      A.killAll()
      t0 = Date.now()
      const child = spawn(A.ASTRO_EXE, ['--enable-logging', '--v=0'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false })
      let errOut = ''
      child.stdout.on('data', (d) => (errOut += d))
      child.stderr.on('data', (d) => (errOut += d))
      const exited = new Promise((r) => child.on('exit', (code, signal) => r({ code, signal, afterMs: Date.now() - t0 })))
      found = await waitFor(() => findDefaultConfig(t0), { timeoutMs: 60_000, what: 'config.json of the default profile' }).catch(() => null)
      const ex = await Promise.race([exited, sleep(1000).then(() => null)])
      const at = { how: 'chrome.exe --enable-logging --v=0 (no --user-data-dir)', configFound: Boolean(found), exit: ex ? { ...ex, codeHex: ex.code != null ? `0x${(ex.code >>> 0).toString(16)}` : null } : 'still running', output: errOut.slice(-2000), ...snapshot('60 s after chrome.exe') }
      diag.attempts.push(at)
      if (found) how = 'chrome.exe with no profile flag (the shortcut did not start it)'
    }
    diag.appErrors = appErrors(600)
    const udRoot = path.join(la, 'BrowserOS', 'User Data')
    diag.defaultUserData = fs.existsSync(udRoot) ? { path: udRoot, entries: fs.readdirSync(udRoot).slice(0, 60), dumps: A.crashDumps(udRoot) } : null
    const dbg = path.join(udRoot, 'chrome_debug.log')
    if (fs.existsSync(dbg)) ctx.writeText('default-chrome_debug.log.txt', fs.readFileSync(dbg, 'utf8').split(/\r?\n/).slice(-300).join('\n'))
    ctx.writeJson('diagnosis.json', diag)
    if (!found) {
      shotDesktop(ctx, 'desktop-shortcut-end.png')
      const a2 = diag.attempts[1]
      return {
        result: 'fail',
        actual: `the default profile never started. Shortcut via explorer.exe: chrome.exe processes after 45 s ${diag.attempts[0].procs.length}, windows ${diag.attempts[0].windows.length}. chrome.exe with no profile flag: ${a2 ? (typeof a2.exit === 'object' ? `exited after ${(a2.exit.afterMs / 1000).toFixed(1)} s, code ${a2.exit.codeHex}` : 'still running, no config.json in 60 s') : 'not run'}; user data dirs: ${diag.defaultUserData ? `${udRoot} (Crashpad dumps ${diag.defaultUserData.dumps.length})` : 'none'}; crash events: ${diag.appErrors.length ? diag.appErrors.map((e) => e.message.split(/\r?\n/).slice(0, 3).join(' ')).join(' | ').slice(0, 400) : 'none'}`,
      }
    }
    const configMs = Date.now() - t0
    const userData = path.dirname(path.dirname(found.file))
    brand.defaultUserData = userData
    const S3 = { profile: userData, cdp: found.cfg.ports.cdp, server: found.cfg.ports.server }
    const h = await A.waitHealth(S3.server)
    await A.waitGateTab(S3.cdp, 60_000).catch(() => null)
    await sleep(5000)
    const targets = await listTargets(S3.cdp)
    ctx.writeJson('targets.json', targets.map((t) => ({ type: t.type, url: t.url, title: t.title })))
    ctx.writeJson('config.json', { file: found.file, cfg: found.cfg })
    shotDesktop(ctx, 'desktop-shortcut-start.png')
    const wins = appWindows()
    recordWindows('Start-menu start')
    const firstT = targets.find((t) => t.type === 'page')
    const png = firstT ? await screenshotTarget(firstT.webSocketDebuggerUrl).catch(() => null) : null
    if (png) fs.writeFileSync(ctx.file('first-tab.png'), png)
    // First run of the default profile shows onboarding: do what a person does, "Skip for now".
    let skip = null
    if (targets.some((t) => t.type === 'page' && t.url.startsWith('chrome://browseros-onboarding'))) {
      const click = uiaClick('Skip for now', 15)
      await sleep(7000)
      const t2 = await listTargets(S3.cdp).catch(() => [])
      skip = { click, pages: t2.filter((t) => t.type === 'page').map((t) => t.url), windows: appWindows().map((w) => w.title) }
      ctx.writeJson('after-skip.json', skip)
      shotDesktop(ctx, 'desktop-after-skip.png')
    }
    const q = await A.quit(S3)
    ctx.writeJson('quit.json', q)
    const viaShortcut = how.startsWith('Start-menu')
    const ok = h.ok && wins.length > 0 && q.clean && viaShortcut
    return {
      result: ok ? 'pass' : 'fail',
      notes: viaShortcut ? '' : 'the Start-menu shortcut did not start the browser; chrome.exe with no flags did (see diagnosis.json)',
      actual: `started by ${how}; ${skip ? `onboarding shown; "Skip for now" ${skip.click?.ok ? 'clicked' : 'not found'} -> tabs ${skip.pages.join(' , ') || 'none'}, windows ${skip.windows.join(' | ') || 'none'}; ` : ''}user data dir: ${userData}; config.json within ${(configMs / 1000).toFixed(0)} s${diag.clicked ? ` (only after clicking first-run button "${diag.clicked.name}")` : ''}; /health ${h.health?.status}; tabs: ${targets.filter((t) => t.type === 'page').map((t) => t.url).join(' , ')}; windows: ${wins.map((w) => w.title).join(' | ')}; quit: ${quitText(q)}`,
    }
  },
)
A.killAll()

// =====================================================================
// Session D: publik unreachable -> the gate's unreachable screen
// =====================================================================
await runRow(
  {
    id: 'O3-W-02',
    title: 'Gate: publik unreachable screen with Retry',
    expected: 'With publikhq.com mapped to 127.0.0.1:9, the gate shows "publik is not reachable. Check your connection." and a Retry button; Retry keeps the page responsive',
    timeoutMs: 300_000,
  },
  async (ctx) => {
    const P2 = A.profilePath('p2-unreachable')
    const S4 = await A.launch({ profile: P2, fresh: true, args: ['--host-resolver-rules=MAP publikhq.com 127.0.0.1:9, MAP *.publikhq.com 127.0.0.1:9', '--enable-logging', '--v=0'] })
    try {
      await A.waitGateTab(S4.cdp, 90_000)
      await A.connect(S4)
      const gate = await A.findPage(S4, A.APP_URL)
      const retry = gate.getByRole('button', { name: 'Retry' })
      await retry.waitFor({ timeout: 90_000 }).catch(() => null)
      const t1 = await A.visibleText(gate)
      ctx.writeText('gate-unreachable.txt', t1)
      await A.pageShot(gate, ctx.file('gate-unreachable.png'))
      shotDesktop(ctx, 'desktop-unreachable.png')
      let t2 = ''
      if (await retry.count()) {
        await retry.click()
        await sleep(6000)
        await gate.getByRole('button', { name: 'Retry' }).waitFor({ timeout: 30_000 }).catch(() => null)
        t2 = await A.visibleText(gate)
        ctx.writeText('gate-after-retry.txt', t2)
        await A.pageShot(gate, ctx.file('gate-after-retry.png'))
      }
      const msg = /publik is not reachable\. Check your connection\./
      const ok = msg.test(t1) && (await retry.count()) > 0 && msg.test(t2)
      return { result: ok ? 'pass' : 'fail', actual: `first: ${t1.replace(/\n/g, ' / ').slice(0, 200)}; after Retry: ${t2.replace(/\n/g, ' / ').slice(0, 200)}` }
    } finally {
      await A.quit(S4).catch(() => null)
    }
  },
)
A.killAll()

// =====================================================================
// Session E: hosts contacted during start + idle, then About page update check
// =====================================================================
const E = {}
const P3 = A.profilePath('p3-netlog')
const NETLOG = path.join(A.WORK, 'netlog.json')
try {
  const sample = path.join(A.WORK, 'tcp-sample.jsonl')
  const stop = path.join(A.WORK, 'tcp-sample.stop')
  for (const f of [sample, stop, NETLOG]) fs.rmSync(f, { force: true })
  dnsClear()
  const sampler = winBackground('netsample', { Out: sample, StopFile: stop })
  E.tStart = Date.now()
  const S5 = await A.launch({
    profile: P3,
    fresh: true,
    args: [`--log-net-log=${NETLOG}`, '--net-log-capture-mode=Default', '--enable-logging', '--v=0', '--vmodule=winsparkle_glue=1,*browseros*=1'],
  })
  E.health = await A.waitHealth(S5.server)
  const left = IDLE_MS - (Date.now() - S5.t0)
  console.log(`session E: idle ${Math.round(Math.max(left, IDLE_MS) / 1000)} s`)
  await sleep(Math.max(left, IDLE_MS)) // at least IDLE_MS of idle after the start finished
  E.tIdleEnd = Date.now()
  E.dnsIdle = dnsCache()
  E.windowsIdle = appWindows()
  E.idleShot = path.join(A.WORK, 'idle-end.png')
  desktopShot(E.idleShot)
  // About page: on Windows it runs WinSparkle's check (with its own UI).
  // Raw CDP probe: a renderer crash here must not lose the net-log rows.
  E.helpShot = path.join(A.WORK, 'settings-help.png')
  try {
    E.helpProbe = await A.cdpPageProbe(S5.cdp, 'chrome://settings/help', { waitMs: 25_000, shotFile: E.helpShot, ax: true, walk: true, keepOpen: true })
  } catch (e) {
    E.helpProbe = { error: e.message }
  }
  E.helpText = E.helpProbe.text || E.helpProbe.axText || ''
  brand.helpText = E.helpText
  E.helpDesktop = path.join(A.WORK, 'settings-help-desktop.png')
  desktopShot(E.helpDesktop)
  E.windowsAfterHelp = appWindows()
  for (const w of E.windowsAfterHelp) if (w.title) brand.windowTitles.push({ where: 'About page / update check', title: w.title, class: w.class, process: w.name })
  E.uia = uiaDump()
  E.winsparkleReg = regDump('HKCU:\\Software\\BrowserOS')
  E.astroReg = regDump('HKCU:\\Software\\Astro')
  E.quit = await A.quit(S5).catch((e) => ({ error: e.message }))
  fs.writeFileSync(stop, '')
  await new Promise((r) => {
    sampler.on('exit', r)
    setTimeout(r, 15_000)
  })
  E.dnsAll = dnsCache()
  E.tcp = fs.existsSync(sample)
    ? fs.readFileSync(sample, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    : []
  E.net = parseNetLog(NETLOG, { splitAt: E.tIdleEnd })
  E.log = fs.existsSync(path.join(P3, 'chrome_debug.log')) ? fs.readFileSync(path.join(P3, 'chrome_debug.log'), 'utf8') : ''
} catch (e) {
  E.error = e
  console.log(`session E failed: ${e.stack}`)
}
A.killAll()

const needE = (def) => {
  if (E.error && !E.net) {
    blockedRow(def, `net-log session failed: ${E.error.message}`)
    return false
  }
  return true
}

/** Remote hosts of the app's own TCP connections (server process included), named through the DNS cache. */
function tcpHosts(splitAt) {
  return tcpHostsFrom(E.tcp ?? [], [...(E.dnsIdle ?? []), ...(E.dnsAll ?? [])], splitAt)
}
function tcpHostsFrom(tcpRows, dnsRows, splitAt) {
  const ipNames = new Map()
  for (const d of dnsRows) {
    if (!d.data) continue
    if (!ipNames.has(d.data)) ipNames.set(d.data, new Set())
    ipNames.get(d.data).add(d.name.toLowerCase())
  }
  const out = new Map()
  for (const c of tcpRows) {
    const key = `${c.name}|${c.ra}:${c.rp}`
    if (!out.has(key)) out.set(key, { process: c.name, remote: `${c.ra}:${c.rp}`, names: [...(ipNames.get(c.ra) ?? [])], first: c.t, phase: c.t <= splitAt ? 'idle' : 'after' })
  }
  return [...out.values()]
}

D = {
  id: 'O9-W-07',
  title: 'Hosts contacted during start + 3 min idle (no browseros hosts)',
  expected: 'A fresh start plus 3 minutes idle contacts only expected hosts (publikhq.com, Google/Chromium services); no *.browseros.com',
}
if (needE(D))
  await runRow(D, async (ctx) => {
    const idle = E.net.hosts.filter((h) => h.phases.includes('idle') && !h.local)
    const tcp = tcpHosts(E.tIdleEnd)
    const serverTcp = tcp.filter((t) => !/^chrome$/i.test(t.process))
    const browseros = [...idle.map((h) => h.host), ...tcp.flatMap((t) => t.names)].filter((h) => /browseros/i.test(h))
    ctx.writeJson('hosts-idle.json', idle)
    ctx.writeJson('requests.json', E.net.requests)
    ctx.writeJson('tcp-connections.json', tcp)
    ctx.writeJson('dns-cache-after-idle.json', E.dnsIdle)
    try {
      fs.copyFileSync(NETLOG, ctx.file('netlog.json'))
    } catch {}
    if (E.idleShot && fs.existsSync(E.idleShot)) fs.copyFileSync(E.idleShot, ctx.file('desktop-idle-end.png'))
    return {
      result: browseros.length === 0 ? 'pass' : 'fail',
      actual: `${idle.length} host(s) from the browser in start + ${Math.round(IDLE_MS / 1000)} s idle: ${idle.map((h) => `${h.host}${h.statuses.length ? `(${h.statuses.join('/')})` : ''}${h.errors.length ? `[${h.errors.join('/')}]` : ''}`).join(', ')}; non-chrome TCP: ${serverTcp.map((t) => `${t.process}->${t.names[0] ?? t.remote}`).join(', ') || 'none'}; browseros hosts: ${[...new Set(browseros)].join(', ') || 'none'}`,
      details: { idleHosts: idle.map((h) => h.host), browseros: [...new Set(browseros)], serverTcp },
    }
  })

D = { id: 'O9-W-08', title: 'Dead addresses among contacted hosts', expected: 'Every URL the browser requested in start + idle answers (no DNS failure, no connection error, no HTTP >= 400)' }
if (needE(D))
  await runRow(D, async (ctx) => {
    const reqs = E.net.requests.filter((r) => r.phase === 'idle' && !isLocal(r.host))
    const bad = reqs.filter((r) => r.netError || (r.status && r.status >= 400))
    const dnsFail = E.net.hosts.filter((h) => h.phases.includes('idle') && h.errors.some((e) => /NAME_NOT_RESOLVED|DNS/.test(e)))
    ctx.writeJson('failing-requests.json', bad)
    ctx.writeJson('dns-failures.json', dnsFail)
    const uniq = [...new Map(bad.map((r) => [`${r.url}|${r.status}|${r.netError}`, r])).values()]
    return {
      result: uniq.length === 0 && dnsFail.length === 0 ? 'pass' : 'fail',
      actual: `${reqs.length} request(s); failing: ${uniq.map((r) => `${r.url.slice(0, 100)} -> ${r.status ?? ''}${r.netError ?? ''}`).join(' ; ') || 'none'}; DNS failures: ${dnsFail.map((h) => h.host).join(', ') || 'none'}`,
    }
  })

// ---------------- update addresses (binary scan + logs) ----------------
let urlMap = null
try {
  urlMap = scanUrls(INSTALL_DIR)
} catch (e) {
  console.log(`URL scan failed: ${e.message}`)
}

D = {
  id: 'O2-W-14',
  title: 'Update check addresses answer',
  expected: 'Every update/appcast address in the installed binaries (WinSparkle feed, server appcast, extension config/update manifest) answers 200 with a feed; none points at browseros.com',
}
if (!urlMap) blockedRow(D, 'binary URL scan failed')
else
  await runRow(D, async (ctx) => {
    const all = [...urlMap.keys()].sort()
    ctx.writeText('urls-all.txt', all.map((u) => `${u}\t${[...urlMap.get(u)].join(', ')}`).join('\n'))
    const pub = all.filter((u) => /publikhq\.com/i.test(u))
    const upd = all.filter((u) => /appcast|sparkle|update-manifest|updates\.xml|\/update\/|extensions\.json/i.test(u) && /publikhq|browseros/i.test(u))
    const bros = all.filter((u) => /browseros\.com/i.test(u))
    const check = [...new Set([...pub, ...upd])]
    const res = []
    for (const u of check) res.push({ ...(await A.httpGet(u, 15_000)), foundIn: [...urlMap.get(u)] })
    const logLines = (E.log ?? '').split(/\r?\n/).filter((l) => /winsparkle|appcast|sparkle|update/i.test(l)).slice(0, 300)
    ctx.writeText('update-log-lines.txt', logLines.join('\n'))
    ctx.writeJson('update-urls.json', res.map((r) => ({ url: r.url, status: r.status, contentType: r.contentType, error: r.error, foundIn: r.foundIn, body: (r.body ?? '').slice(0, 300) })))
    ctx.writeJson('browseros-urls-in-binaries.json', bros.map((u) => ({ url: u, foundIn: [...urlMap.get(u)] })))
    ctx.writeJson('winsparkle-registry.json', { browseros: E.winsparkleReg, astro: E.astroReg })
    const feedLine = logLines.find((l) => /WinSparkle: initialized, feed/.test(l))
    const updRes = res.filter((r) => /\/astro\/(update|ext)\/|appcast|sparkle/i.test(r.url))
    const bad = updRes.filter((r) => !(r.status >= 200 && r.status < 300))
    return {
      result: updRes.length > 0 && bad.length === 0 ? 'pass' : 'fail',
      actual: `${updRes.map((r) => `${r.url} -> ${r.status || r.error}`).join(' ; ')}; WinSparkle log: ${feedLine ? feedLine.slice(-140) : '(no "initialized, feed" line)'}; browseros.com URLs still in binaries: ${bros.length}`,
      notes: `publikhq.com URLs in binaries: ${pub.length}. WinSparkle registry HKCU\\Software\\BrowserOS: ${JSON.stringify(E.winsparkleReg ?? {}).slice(0, 300)}`,
    }
  })

D = { id: 'O2-W-15', title: 'About page update check (chrome://settings/help)', expected: 'The About page finishes its update check with "up to date" (or offers an update); no error dialog' }
if (needE(D))
  await runRow(D, async (ctx) => {
    ctx.writeText('settings-help.txt', E.helpText ?? '')
    ctx.writeJson('help-probe.json', { ...(E.helpProbe ?? {}), text: undefined, axText: undefined })
    for (const [src, name] of [
      [E.helpShot, 'settings-help.png'],
      [E.helpDesktop, 'desktop-after-help.png'],
    ])
      if (src && fs.existsSync(src)) fs.copyFileSync(src, ctx.file(name))
    ctx.writeJson('windows.json', E.windowsAfterHelp ?? [])
    ctx.writeJson('uia.json', E.uia ?? [])
    const sparkleWins = (E.windowsAfterHelp ?? []).filter((w) => !/Chrome_WidgetWin/.test(w.class) && w.title)
    const sparkleTitles = new Set(sparkleWins.map((w) => w.title))
    const uiaText = Array.isArray(E.uia) ? E.uia.filter((x) => sparkleTitles.has(x.window)).map((x) => x.name).join(' / ') : ''
    const errorShown = /error|failed|could not|unable/i.test(`${[...sparkleTitles].join(' ')} ${uiaText}`)
    const helpLines = (E.helpText ?? '').split('\n')
    const status = helpLines.find((l) => /update|up to date|checking|version/i.test(l)) ?? '(no status line)'
    const upToDate = /up to date/i.test(E.helpText ?? '')
    return {
      result: upToDate && !errorShown ? 'pass' : 'fail',
      actual: `${E.helpProbe?.crashed ? `About page CRASHED during ${E.helpProbe.crashPhase} after ${(E.helpProbe.crashAtMs / 1000).toFixed(1)} s; ` : ''}About page: "${status}"; other windows: ${sparkleWins.map((w) => `"${w.title}" (${w.class})`).join(', ') || 'none'}; dialog text: ${uiaText.slice(0, 300)}`,
    }
  })

// =====================================================================
// O8-W-10 diagnostic: undo the rebrand's renamed i18n key, retest settings
// =====================================================================
const fixed = {}
await runRow(
  {
    id: 'O8-W-10',
    title: 'Diagnostic: settings pages with the renamed i18n key restored in resources.pak',
    expected: 'The recut rebrand renamed $i18n{aboutBrowserOSVersion} to $i18n{aboutAstroVersion} in resources.pak. With only that key put back, chrome://settings, /help and /search open without a crash (confirms the root cause of O8-W-09); the shipped pak is restored afterwards',
    timeoutMs: 330_000,
  },
  async (ctx) => {
    const ver = fs.readdirSync(INSTALL_DIR).find((d) => /^\d+(\.\d+){3}$/.test(d))
    if (!ver) throw new Blocked(`no version folder in ${INSTALL_DIR}`)
    const pak = path.join(INSTALL_DIR, ver, 'resources.pak')
    const orig = fs.readFileSync(pak)
    const renamed = findRenamedKeys(orig)
    ctx.writeJson('renamed-keys.json', renamed)
    if (!renamed.length) throw new Blocked('no renamed $i18n key in resources.pak')
    const { out, changed } = restoreRenamedKeys(orig)
    const backup = path.join(A.WORK, 'resources.pak.shipped')
    fs.writeFileSync(backup, orig)
    let S6 = null
    try {
      fs.writeFileSync(pak, out)
      const P5 = A.profilePath('p5-pakfix')
      S6 = await A.launch({ profile: P5, fresh: true, args: ['--enable-logging', '--v=0'] })
      await A.waitHealth(S6.server)
      await A.waitGateTab(S6.cdp, 60_000).catch(() => null)
      const d0 = A.crashDumps(P5)
      const probes = []
      for (const [i, u] of ['chrome://settings', 'chrome://settings/search'].entries()) probes.push(await A.cdpPageProbe(S6.cdp, u, { waitMs: 5000, shotFile: ctx.file(`fixed-settings-${i}.png`), walk: false }))
      // About page: let its update check run (WinSparkle on Windows), read it without page script.
      const help = await A.cdpPageProbe(S6.cdp, 'chrome://settings/help', { waitMs: 25_000, shotFile: ctx.file('fixed-settings-help.png'), ax: true, walk: false, keepOpen: true })
      probes.push(help)
      shotDesktop(ctx, 'desktop-fixed-help.png')
      fixed.windows = appWindows()
      fixed.helpText = help.axText ?? ''
      ctx.writeText('fixed-help-text.txt', fixed.helpText)
      ctx.writeJson('windows-after-help.json', fixed.windows)
      const d1 = A.crashDumps(P5)
      ctx.writeJson('probes.json', { changed, probes: probes.map((p) => ({ ...p, axText: undefined, text: undefined })), dumpsBefore: d0, dumpsAfter: d1 })
      fixed.quit = await A.quit(S6)
      S6 = null
      const crashed = probes.filter((p) => p.crashed)
      const status = fixed.helpText.split('\n').find((l) => /up to date|updat|checking|version/i.test(l)) ?? '(no status line)'
      const other = (fixed.windows ?? []).filter((w) => !/Chrome_WidgetWin/.test(w.class) && w.title)
      return {
        result: crashed.length === 0 ? 'pass' : 'fail',
        actual: `restored ${renamed.flatMap((r) => r.keys).join(', ')} in entry ${changed.map((c) => c.id).join(', ')}; ${probes.map(A.probeText).join(' ; ')}; Crashpad dumps ${d0.length} -> ${d1.length}; About page then reads: "${status}"; other windows: ${other.map((w) => `"${w.title}"`).join(', ') || 'none'}`,
        notes: crashed.length === 0 ? 'root cause confirmed: the renamed $i18n key alone crashes every settings page' : 'still crashes with the key restored: the key is not the (only) cause',
      }
    } finally {
      if (S6) await A.quit(S6).catch(() => null)
      A.killAll()
      fs.writeFileSync(pak, orig)
    }
  },
)

// =====================================================================
// O9 brand rows
// =====================================================================
const brandRow = async (def, collect) =>
  runRow(def, async (ctx) => {
    const { surfaces, evidence } = await collect(ctx)
    const hits = []
    for (const [where, text] of Object.entries(surfaces)) for (const h of brandHits(text)) hits.push({ where, context: h })
    ctx.writeJson('brand-hits.json', { surfaces, hits, ...(evidence ?? {}) })
    return {
      result: hits.length === 0 ? 'pass' : 'fail',
      actual: hits.length ? `${hits.length} "BrowserOS" hit(s): ${hits.slice(0, 8).map((h) => `[${h.where}] …${h.context}…`).join(' ; ')}` : `no "BrowserOS" in ${Object.keys(surfaces).join(', ')}`,
    }
  })

await brandRow({ id: 'O9-W-01', title: 'Brand: chrome://version', expected: 'No "BrowserOS" on chrome://version' }, async () => {
  if (!brand.versionText) throw new Blocked('chrome://version text not captured (O8-W-07)')
  return { surfaces: { 'chrome://version': brand.versionText } }
})

await brandRow({ id: 'O9-W-02', title: 'Brand: chrome://settings/help (About)', expected: 'No "BrowserOS" on the About page' }, async () => {
  if (!brand.helpText) {
    const extra = fixed.helpText ? `; with the key restored (O8-W-10) the About page text has ${brandHits(fixed.helpText).length} "BrowserOS" hit(s)${brandHits(fixed.helpText).length ? `: ${brandHits(fixed.helpText).slice(0, 3).join(' ; ')}` : ''}` : ''
    throw new Blocked(`the shipped About page crashes on load (O8-W-09), no text to check${extra}`)
  }
  return { surfaces: { 'chrome://settings/help': brand.helpText } }
})

await brandRow({ id: 'O9-W-03', title: 'Brand: window titles', expected: 'No "BrowserOS" in any window title of the app (browser, incognito, update dialogs)' }, async () => {
  if (!brand.windowTitles.length) throw new Blocked('no window titles captured')
  const uniq = [...new Map(brand.windowTitles.map((w) => [`${w.where}|${w.title}`, w])).values()]
  return { surfaces: Object.fromEntries(uniq.map((w, i) => [`${w.where} #${i} (${w.class})`, w.title])) }
})

await brandRow(
  { id: 'O9-W-04', title: 'Brand: installer, Add/Remove Programs, shortcuts', expected: 'No "BrowserOS" in the installer version info, the ARP entry or the shortcut names/targets/descriptions' },
  async () => {
    const setup = process.env.ASTRO_SETUP
    const vi = setup && fs.existsSync(setup) ? verInfo(setup) : {}
    const arp = regDump(ARP_KEY)
    const lnks = [lnkInfo(SM_LNK), lnkInfo(DESK_LNK)]
    return {
      surfaces: {
        'installer version info': JSON.stringify(vi),
        'ARP entry': JSON.stringify(arp),
        shortcuts: JSON.stringify(lnks),
      },
    }
  },
)

await brandRow(
  { id: 'O9-W-05', title: 'Brand: install folder and user data folder names', expected: 'No "BrowserOS" in the file/folder names a user can see under Program Files\\Astro or in the default user data folder name' },
  async (ctx) => {
    const tree = A.listTree(INSTALL_DIR)
    ctx.writeText('install-tree.txt', tree.join('\n'))
    // Folder names only (depth <= 3) and executables: what Explorer shows when a person looks.
    const visible = tree.filter((p) => p.split('\\').filter(Boolean).length <= 3 && (p.endsWith('\\') || /\.(exe|lnk)$/i.test(p)))
    let words = {}
    try {
      words = scanWord(INSTALL_DIR)
    } catch {}
    return {
      surfaces: {
        'install dir (folders + exe, depth<=3)': visible.join('\n'),
        'default user data dir': brand.defaultUserData ?? '',
      },
      evidence: { binaryCountsOfWordBrowserOS: words },
    }
  },
)

await brandRow(
  { id: 'O9-W-06', title: 'Brand: process names and Task Manager descriptions', expected: 'No "BrowserOS" in the process names or the FileDescription/ProductName Task Manager shows' },
  async () => {
    if (!brand.procs.length) throw new Blocked('no running processes captured in session A')
    const uniq = [...new Map(brand.procs.map((p) => [`${p.name}|${p.description}|${p.product}`, p])).values()]
    return { surfaces: Object.fromEntries(uniq.map((p) => [`${p.name}.exe`, `name=${p.name} description=${p.description} product=${p.product} company=${p.company}`])) }
  },
)

console.log('phase 1 done')
process.exit(0)
