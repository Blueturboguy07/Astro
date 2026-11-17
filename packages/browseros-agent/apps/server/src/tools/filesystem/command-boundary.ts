import { realpathSync } from 'node:fs'
import { dirname, resolve, win32 } from 'node:path'
import { isPathInside } from './path-boundary'

/* Astro 0.2.4 QA, F-083: a static check of a filesystem_bash command before
   it runs. It is defence in depth: on macOS the shell also runs inside a
   sandbox (shell-sandbox.ts) that is the real guard; on Windows and Linux this
   check is the only guard. It refuses what it can see in the command text:
   `..` segments, absolute paths outside the workspace, `~user`, variables
   that expand to such paths, and words that are symlinks leading out.
   Commands that build a path at run time (for example from base64) are not
   visible here. */

export interface CommandCheckOptions {
  /** Canonical (realpath) workspace root. */
  root: string
  /** Canonical per-run temp folder, also allowed. */
  tempDir?: string
  /** The environment the shell will get (used to expand variables). */
  env: Record<string, string | undefined>
  platform: NodeJS.Platform
}

const PARENT_SEGMENT = /(^|[\s/\\'"=:;|&(<>`,{])\.\.(?=$|[\s/\\'"=:;|&)<>`},])/
const TILDE_USER = /(^|[\s'"=:;|&(<>`])~(?=[A-Za-z0-9_.+-])/
const URL_TEXT = /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s'"`]*/g
const POSIX_ABSOLUTE = /(?:^|[\s'"=:;|&(<>`,])(\/[^\s'"`;|&()<>,]*)/g
const QUOTED_ABSOLUTE = /'(\/[^'\n]*)'|"(\/[^"\n]*)"/g
const WIN_DRIVE_PATH =
  /(?:^|[\s'"=;|&(<>,])([A-Za-z]:(?:[\\/][^\s'"`;|&()<>,]*)?)/g
const WIN_UNC = /(?:^|[\s'"=;|&(<>,])(\\\\|\/\/)/
const WIN_ROOT_RELATIVE = /(?:^|[\s'"=;|&(<>,])(\\(?!\\)[^\s'"`;|&()<>,]*)/g

const SYSTEM_DEVICES = new Set([
  '/dev/null',
  '/dev/zero',
  '/dev/random',
  '/dev/urandom',
  '/dev/stdin',
  '/dev/stdout',
  '/dev/stderr',
  '/dev/tty',
])
const SYSTEM_BIN_DIRS = [
  '/bin/',
  '/sbin/',
  '/usr/bin/',
  '/usr/sbin/',
  '/usr/local/bin/',
  '/opt/homebrew/bin/',
]

const OUTSIDE =
  'The command must stay inside the selected workspace folder. filesystem_bash refuses'

function lookupEnv(
  env: Record<string, string | undefined>,
  name: string,
  caseInsensitive: boolean,
): string {
  if (!caseInsensitive) return env[name] ?? ''
  const key = Object.keys(env).find(
    (k) => k.toLowerCase() === name.toLowerCase(),
  )
  return key ? (env[key] ?? '') : ''
}

/** The command text with $VAR, ${VAR...} and (Windows) %VAR% replaced by the
    values the shell would see; ${VAR:-word} keeps the word too. */
export function expandVariables(
  command: string,
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform,
): string {
  const win = platform === 'win32'
  let out = command.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)([^}]*)\}/g,
    (_m, name: string, rest: string) => {
      const word = rest.replace(/^[:#%/^,@]*[-=?+]?/, '')
      return `${lookupEnv(env, name, win)}${word ? ` ${word}` : ''}`
    },
  )
  out = out.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_m, name: string) =>
    lookupEnv(env, name, win),
  )
  if (win) {
    out = out.replace(/%([A-Za-z_][A-Za-z0-9_()]*)%/g, (_m, name: string) =>
      lookupEnv(env, name, true),
    )
  }
  return out
}

/** Longest existing prefix of an absolute path, as a realpath; null when not
    even the first segment exists (then it is not a real path, for example an
    awk pattern like /foo/). "/" itself is a real path. */
function realPrefix(path: string): string | null {
  if (path === '/') return '/'
  let current = path
  while (current !== dirname(current) && dirname(current) !== current) {
    try {
      return realpathSync(current)
    } catch {
      const parent = dirname(current)
      if (parent === '/' || parent === current) return null
      current = parent
    }
  }
  return null
}

function insideAllowed(real: string, opts: CommandCheckOptions): boolean {
  if (isPathInside(opts.root, real)) return true
  return Boolean(opts.tempDir && isPathInside(opts.tempDir, real))
}

function checkPosixAbsolute(
  path: string,
  opts: CommandCheckOptions,
): string | null {
  const lexical = resolve(path)
  if (SYSTEM_DEVICES.has(lexical) || /^\/dev\/fd\/\d+$/.test(lexical)) {
    return null
  }
  if (SYSTEM_BIN_DIRS.some((dir) => lexical.startsWith(dir))) return null
  const real = realPrefix(lexical)
  if (real === null) return null
  return insideAllowed(real, opts) ? null : path
}

function checkWindowsPath(
  path: string,
  opts: CommandCheckOptions,
): string | null {
  const full = win32.resolve(opts.root, path).toLowerCase()
  const roots = [opts.root, opts.tempDir]
    .filter((r): r is string => Boolean(r))
    .map((r) => win32.resolve(r).toLowerCase())
  return roots.some((r) => full === r || full.startsWith(`${r}\\`))
    ? null
    : path
}

/** Words of the command that may name files (quotes stripped). */
function candidateWords(text: string): string[] {
  return text
    .split(/[\s;|&()<>`]+/)
    .flatMap((w) => w.split('='))
    .map((w) => w.replace(/^['"]+|['"]+$/g, ''))
    .filter((w) => w && !w.startsWith('-') && !w.includes('$'))
    .slice(0, 200)
}

function symlinkEscape(word: string, opts: CommandCheckOptions): boolean {
  const lexical = resolve(opts.root, word)
  if (!isPathInside(opts.root, lexical)) return false
  const real = realPrefix(lexical)
  return real !== null && !insideAllowed(real, opts)
}

function windowsPathEscape(
  text: string,
  opts: CommandCheckOptions,
): string | null {
  if (WIN_UNC.test(text)) return `${OUTSIDE} network (UNC) paths.`
  const rest = text.replace(URL_TEXT, ' ')
  for (const re of [WIN_DRIVE_PATH, WIN_ROOT_RELATIVE]) {
    for (const m of rest.matchAll(re)) {
      const bad = checkWindowsPath(m[1] ?? '', opts)
      if (bad) return `${OUTSIDE} the path ${bad}.`
    }
  }
  return null
}

function posixPathEscape(
  text: string,
  opts: CommandCheckOptions,
): string | null {
  const rest = text.replace(URL_TEXT, ' ')
  const paths = [
    ...[...rest.matchAll(QUOTED_ABSOLUTE)].map((m) => m[1] ?? m[2] ?? ''),
    ...[...rest.replace(QUOTED_ABSOLUTE, ' ').matchAll(POSIX_ABSOLUTE)].map(
      (m) => m[1] ?? '',
    ),
  ]
  for (const path of paths) {
    const bad = checkPosixAbsolute(path, opts)
    if (bad) return `${OUTSIDE} the path ${bad}.`
  }
  return null
}

function textEscape(text: string, opts: CommandCheckOptions): string | null {
  const win = opts.platform === 'win32'
  if (PARENT_SEGMENT.test(text)) return `${OUTSIDE} ".." (the parent folder).`
  if (!win && TILDE_USER.test(text)) {
    return `${OUTSIDE} "~name" (another home folder).`
  }
  return win ? windowsPathEscape(text, opts) : posixPathEscape(text, opts)
}

function linkEscape(command: string, opts: CommandCheckOptions): string | null {
  /* Symlinks need the real file system, so only on the platform we run on. */
  if (opts.platform !== process.platform) return null
  const win = opts.platform === 'win32'
  for (const word of candidateWords(command)) {
    if (win ? /^[A-Za-z]:|^[\\/]/.test(word) : word.startsWith('/')) continue
    if (symlinkEscape(word, opts)) {
      return `${OUTSIDE} ${word}: it is a link that leads outside the workspace.`
    }
  }
  return null
}

/** null when the command may run; otherwise the reason it was refused. */
export function findCommandEscape(
  command: string,
  opts: CommandCheckOptions,
): string | null {
  const expanded = expandVariables(command, opts.env, opts.platform)
  for (const text of new Set([command, expanded])) {
    const reason = textEscape(text, opts)
    if (reason) return reason
  }
  return linkEscape(command, opts)
}
