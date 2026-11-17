// Node wrapper around lib/win.ps1 (Windows PowerShell 5.1 desktop helper).
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PS1 = path.join(HERE, 'win.ps1')
export const INSTALL_DIR = process.env.ASTRO_INSTALL_DIR || 'C:\\Program Files\\Astro'

function psArgs(action, opts) {
  const a = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-Action', action, '-Root', INSTALL_DIR]
  for (const [k, v] of Object.entries(opts ?? {})) {
    if (v === undefined || v === null) continue
    a.push(`-${k}`, String(v))
  }
  return a
}

/** Run one helper action and parse its JSON line. Never throws: returns { error } instead. */
export function win(action, opts = {}, timeoutMs = 120_000) {
  const r = spawnSync('powershell.exe', psArgs(action, opts), {
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  })
  const out = (r.stdout || '').trim().split(/\r?\n/).filter(Boolean)
  const last = out[out.length - 1]
  try {
    return JSON.parse(last)
  } catch {
    return { error: `win.ps1 ${action} failed (status ${r.status}): ${(r.stderr || last || '').slice(0, 800)}` }
  }
}

/** Start a long-running helper (netsample). Returns the child; stop it by creating StopFile. */
export function winBackground(action, opts = {}) {
  const child = spawn('powershell.exe', psArgs(action, opts), { stdio: 'ignore', windowsHide: true })
  return child
}

export const desktopShot = (out) => win('shot', { Out: out })
export const appWindows = () => {
  const all = win('windows')
  if (!Array.isArray(all)) return []
  return all.filter((w) => w.path && w.path.toLowerCase().startsWith(INSTALL_DIR.toLowerCase()))
}
export const allWindows = () => {
  const all = win('windows')
  return Array.isArray(all) ? all : []
}
export const appProcs = () => {
  const p = win('procs')
  return Array.isArray(p) ? p : []
}
export const sendKeys = (keys) => win('keys', { Keys: keys })
export const uiaClick = (name, timeoutSec = 20) => win('uia-click', { Name: name, TimeoutSec: timeoutSec }, (timeoutSec + 30) * 1000)
export const uiaDump = () => win('uia-dump', {}, 180_000)
export const closeAppWindows = () => win('close')
export const lnkInfo = (p) => win('lnk', { Path: p })
export const verInfo = (p) => win('verinfo', { Path: p })
export const regDump = (p) => win('reg', { Path: p })
export const dnsCache = () => {
  const d = win('dns')
  return Array.isArray(d) ? d : []
}
export const dnsClear = () => win('dns-clear')
