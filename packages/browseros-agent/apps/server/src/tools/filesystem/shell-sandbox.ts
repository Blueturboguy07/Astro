import { existsSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'

/* Astro 0.2.4 QA, F-083: on macOS filesystem_bash runs inside sandbox-exec.
   The profile denies every file read and write, then allows (the LAST
   matching rule wins in SBPL, checked on macOS 15):
   - read: "/" itself (zsh reads it) and system folders the shell and common tools need (/bin, /usr,
     /System, /Library, /private/etc, /opt, /dev, the selected Xcode or
     Command Line Tools), and metadata only for the workspace's parent chain;
   - read and write: the workspace and a temp folder made for this run;
   - write: /dev/null, /dev/zero, ttys, /dev/fd.
   /Users (other than the workspace), /Volumes, /private/var/folders and
   /private/tmp stay closed. Network access is not changed.
   Paths go in as -D parameters, so the profile needs no escaping. */

export const SANDBOX_EXEC = '/usr/bin/sandbox-exec'

const SYSTEM_READ = [
  '/bin',
  '/sbin',
  '/usr',
  '/System',
  '/Library',
  '/private/etc',
  '/opt',
  '/dev',
  '/private/var/select',
  '/private/var/db/timezone',
  '/private/var/db/dyld',
]

const SYSTEM_METADATA = [
  '/etc',
  '/tmp',
  '/var',
  '/private',
  '/private/var',
  '/private/var/db',
  '/Applications',
]

const quote = (s: string) => JSON.stringify(s)

/** The parent folders of a path, from "/" down (without the path itself). */
export function parentChain(path: string): string[] {
  const out: string[] = []
  let current = dirname(path)
  while (current !== dirname(current)) {
    out.unshift(current)
    current = dirname(current)
  }
  return out
}

/** The .app bundle (or folder) of the selected developer tools, if any. */
function developerRoot(devDir: string | undefined): string | undefined {
  if (!devDir) return undefined
  const app = devDir.match(/^(.*?\.app)(\/|$)/)
  return app ? app[1] : devDir
}

export function sandboxProfile(parents: number, devRoot?: string): string {
  const params = Array.from(
    { length: parents },
    (_, i) => `(literal (param "P${i}"))`,
  ).join(' ')
  return [
    '(version 1)',
    '(allow default)',
    '(deny file-read* file-write*)',
    `(allow file-read* (literal "/") ${SYSTEM_READ.map((p) => `(subpath ${quote(p)})`).join(' ')}${devRoot ? ' (subpath (param "DEV"))' : ''})`,
    `(allow file-read-metadata ${SYSTEM_METADATA.map((p) => `(literal ${quote(p)})`).join(' ')}${params ? ` ${params}` : ''})`,
    '(allow file-read-data file-read-metadata (regex #"^/private/var/folders/[^/]+/[^/]+/T/xcrun_db$"))',
    '(allow file-read* file-write* (subpath (param "WS")) (subpath (param "TMP")))',
    '(allow file-write* (literal "/dev/null") (literal "/dev/zero") (literal "/dev/dtracehelper") (regex #"^/dev/tty") (subpath "/dev/fd"))',
  ].join('\n')
}

let cachedDevDir: string | null | undefined

/** `xcode-select -p`, once per server process. */
export function developerDir(): string | undefined {
  if (cachedDevDir === undefined) {
    cachedDevDir = null
    const fromEnv = process.env.DEVELOPER_DIR
    if (fromEnv && existsSync(fromEnv)) {
      cachedDevDir = fromEnv
    } else {
      try {
        const res = Bun.spawnSync(['/usr/bin/xcode-select', '-p'], {
          stdout: 'pipe',
          stderr: 'ignore',
        })
        const out = res.stdout.toString().trim()
        if (res.exitCode === 0 && out && existsSync(out)) cachedDevDir = out
      } catch {}
    }
  }
  return cachedDevDir ?? undefined
}

/** The developer tools' bin folder goes right before /usr/bin: the /usr/bin
    git/python3 shims run xcrun, which needs a cache file outside the
    sandbox. Same binaries, found directly. */
export function sandboxPath(path: string | undefined, devDir?: string): string {
  const entries = (path ?? '/usr/bin:/bin:/usr/sbin:/sbin').split(delimiter)
  if (!devDir) return entries.join(delimiter)
  const devBin = join(devDir, 'usr/bin')
  if (!existsSync(devBin) || entries.includes(devBin)) {
    return entries.join(delimiter)
  }
  const at = entries.indexOf('/usr/bin')
  if (at === -1) entries.push(devBin)
  else entries.splice(at, 0, devBin)
  return entries.join(delimiter)
}

export function sandboxArgs(
  root: string,
  tempDir: string,
  shellArgv: string[],
  devDir = developerDir(),
): string[] {
  const parents = parentChain(root)
  const devRoot = developerRoot(devDir)
  const args = [
    SANDBOX_EXEC,
    '-p',
    sandboxProfile(parents.length, devRoot),
    '-D',
    `WS=${root}`,
    '-D',
    `TMP=${tempDir}`,
  ]
  parents.forEach((p, i) => {
    args.push('-D', `P${i}=${p}`)
  })
  if (devRoot) args.push('-D', `DEV=${devRoot}`)
  return [...args, ...shellArgv]
}

/** sandbox-exec's own failure (the profile did not apply), not the command's. */
export function sandboxStartError(
  exitCode: number,
  stderr: string,
): string | null {
  if (exitCode === 0) return null
  const line = stderr.split('\n').find((l) => l.startsWith('sandbox-exec:'))
  return line ?? null
}
