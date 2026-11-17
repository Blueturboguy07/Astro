import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  expandVariables,
  findCommandEscape,
} from '../../../src/tools/filesystem/command-boundary'
import {
  parentChain,
  sandboxPath,
  sandboxProfile,
  sandboxStartError,
} from '../../../src/tools/filesystem/shell-sandbox'

/* Astro 0.2.4 QA, F-083: the static command check (all platforms). */

let base = ''
let root = ''

beforeAll(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'astro-f083-check-')))
  root = join(base, 'My Work')
  await mkdir(join(root, 'sub'), { recursive: true })
  await symlink(base, join(root, 'up'))
})

afterAll(async () => {
  if (base) await rm(base, { recursive: true, force: true })
})

const posix = (command: string, env: Record<string, string> = {}) =>
  findCommandEscape(command, {
    root,
    env: { HOME: root, PWD: root, ...env },
    platform: 'darwin',
  })

describe('findCommandEscape (posix)', () => {
  it.each([
    'ls',
    'cat sub/a.txt',
    'grep -r foo .',
    'git log HEAD..main',
    'echo {1..3}',
    "awk '/foo/ {print}' sub/a.txt",
    'curl -s https://example.com/a/b',
    'cat ~/notes.txt',
    'cat "$HOME/notes.txt"',
    '/usr/bin/env python3 x.py > /dev/null 2>&1',
    'ls /nonexistent_segment_xyz',
  ])('allows %s', (command) => {
    expect(posix(command)).toBeNull()
  })

  it('allows a quoted absolute path inside a workspace with a space', () => {
    expect(posix(`cat "${join(root, 'sub', 'a.txt')}"`)).toBeNull()
  })

  it.each([
    'cat ../x',
    'cd .. && ls',
    'ls ..',
    'cat sub/../../x',
    'echo $(cat ../x)',
    "sh -c 'cat ../x'",
    'cat ~root/x',
    'cat /etc/hosts',
    'cd /',
    'cat up/secret.txt',
    'cat up',
  ])('refuses %s', (command) => {
    expect(posix(command)).toContain('must stay inside')
  })

  it('refuses an absolute path outside the workspace', () => {
    expect(posix(`cat ${join(base, 'x.txt')}`)).toContain('must stay inside')
  })

  it('refuses a variable that expands outside', () => {
    expect(posix('cat $OUT/x.txt', { OUT: base })).toContain('must stay inside')
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell text
    expect(posix('cat ${OUT:-/etc}/hosts')).toContain('must stay inside')
    expect(posix('cat $UNSET/etc/passwd')).toContain('must stay inside')
  })

  it('expands $VAR, {VAR} forms and the default word', () => {
    expect(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: shell text
      expandVariables('a $X ${Y} ${Z:-w}', { X: '1', Y: '2' }, 'darwin'),
    ).toBe('a 1 2  w')
  })
})

describe('findCommandEscape (windows)', () => {
  const win = (command: string) =>
    findCommandEscape(command, {
      root: 'C:\\ws',
      env: { USERPROFILE: 'C:\\Users\\me', TEMP: 'C:\\ws\\tmp' },
      platform: 'win32',
    })

  it.each(['dir /b', 'type a.txt', 'type C:\\ws\\a.txt', 'echo %TEMP%'])(
    'allows %s',
    (command) => {
      expect(win(command)).toBeNull()
    },
  )

  it.each([
    'type C:\\Users\\me\\secret.txt',
    'type D:\\x.txt',
    'type %USERPROFILE%\\secret.txt',
    'type \\\\server\\share\\x',
    'type ..\\x',
    'cd \\ && dir',
    'type \\Windows\\win.ini',
  ])('refuses %s', (command) => {
    expect(win(command)).toContain('must stay inside')
  })
})

describe('shell sandbox profile (macOS)', () => {
  it('lists the parent folders from the top', () => {
    expect(parentChain('/private/tmp/a/ws')).toEqual([
      '/private',
      '/private/tmp',
      '/private/tmp/a',
    ])
  })

  it('denies all file access first, then allows the workspace last', () => {
    const profile = sandboxProfile(2)
    const lines = profile.split('\n')
    expect(lines[2]).toBe('(deny file-read* file-write*)')
    expect(profile).toContain('(literal (param "P0")) (literal (param "P1"))')
    expect(profile).toContain('(subpath (param "WS")) (subpath (param "TMP"))')
    expect(profile).not.toContain('/Users')
    expect(profile).not.toContain('/Volumes')
  })

  it('puts the developer tools before the /usr/bin shims', async () => {
    const dev = join(base, 'Xcode.app/Contents/Developer')
    await mkdir(join(dev, 'usr/bin'), { recursive: true })
    expect(sandboxPath('/opt/homebrew/bin:/usr/bin:/bin', dev)).toBe(
      `/opt/homebrew/bin:${dev}/usr/bin:/usr/bin:/bin`,
    )
    expect(sandboxPath('/usr/bin:/bin', join(base, 'missing'))).toBe(
      '/usr/bin:/bin',
    )
  })

  it('tells a sandbox start failure from a command failure', () => {
    expect(
      sandboxStartError(
        65,
        'sandbox-exec: sandbox_apply: Operation not permitted',
      ),
    ).toContain('sandbox-exec:')
    expect(sandboxStartError(1, 'cat: x: No such file')).toBeNull()
    expect(sandboxStartError(0, 'sandbox-exec: x')).toBeNull()
  })
})
