import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { existsSync } from 'node:fs'
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBashTool } from '../../../src/tools/filesystem/bash'
import type { FilesystemToolResult } from '../../../src/tools/filesystem/utils'

/* Astro 0.2.4 QA, F-083: filesystem_bash must not read or write outside the
   selected workspace. Layout: <tmp>/outside.txt (canary), <tmp>/ws (workspace). */

const CANARY = 'CANARY-F083-OUTSIDE'
const isMac = process.platform === 'darwin'

let base = ''
let ws = ''
let exec: (command: string) => Promise<FilesystemToolResult>

beforeAll(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'astro-f083-')))
  ws = join(base, 'ws')
  await mkdir(ws)
  await writeFile(join(base, 'outside.txt'), `${CANARY}\n`)
  await writeFile(join(ws, 'in.txt'), 'inside text\n')
  await symlink(join(base, 'outside.txt'), join(ws, 'link.txt'))
  await symlink(base, join(ws, 'linkdir'))
  const tool = createBashTool(ws)
  exec = (command) =>
    // biome-ignore lint/suspicious/noExplicitAny: test helper
    (tool as any).execute({ command, timeout: 30 })
})

afterAll(async () => {
  if (base) await rm(base, { recursive: true, force: true })
})

async function expectRefused(command: string) {
  const result = await exec(command)
  expect(result.text).not.toContain(CANARY)
  expect(result.isError).toBe(true)
  expect(result.text).toContain('must stay inside the selected workspace')
}

async function expectNoCanary(command: string) {
  const result = await exec(command)
  expect(result.text).not.toContain(CANARY)
  expect(result.isError).toBe(true)
}

describe('filesystem_bash stays inside the workspace (F-083)', () => {
  it('refuses a parent path', () => expectRefused('cat ../outside.txt'))
  it('refuses ls of the parent', () => expectRefused('ls ..'))
  it('refuses an absolute path outside', () =>
    expectRefused(`cat ${join(base, 'outside.txt')}`))
  it('refuses a quoted absolute path outside', () =>
    expectRefused(`cat "${join(base, 'outside.txt')}"`))
  it('refuses a symlink that leads out', () => expectRefused('cat link.txt'))
  it('refuses a path through a symlinked folder', () =>
    expectRefused('cat linkdir/outside.txt'))
  it('refuses cd out and read', () => expectRefused('cd .. && cat outside.txt'))
  it('refuses a command substitution', () =>
    expectRefused('echo $(cat ../outside.txt)'))
  it('refuses a subshell', () => expectRefused('(cd ..; cat outside.txt)'))
  it('refuses backticks', () => expectRefused('echo `cat ../outside.txt`'))
  it('refuses $HOME/..', () => expectRefused('cat "$HOME/../outside.txt"'))
  it('refuses a nested shell with a parent path', () =>
    expectRefused("sh -c 'cat ../outside.txt'"))
  it('refuses ~user', () => expectRefused('cat ~root/.profile'))
  it('refuses cd /', () => expectRefused('cd / && ls'))
  it('refuses a variable that names an outside folder', async () => {
    process.env.ASTRO_F083_OUT = base
    try {
      await expectRefused('cat $ASTRO_F083_OUT/outside.txt')
    } finally {
      delete process.env.ASTRO_F083_OUT
    }
  })

  it('does not pass OLDPWD to the shell', async () => {
    const old = process.env.OLDPWD
    process.env.OLDPWD = base
    try {
      await expectNoCanary('cat $OLDPWD/outside.txt')
    } finally {
      if (old === undefined) delete process.env.OLDPWD
      else process.env.OLDPWD = old
    }
  })

  it('refuses a write to the parent', async () => {
    await expectRefused('echo x > ../evil.txt')
    expect(existsSync(join(base, 'evil.txt'))).toBe(false)
  })

  /* The static check cannot see a path built at run time: on macOS the
     sandbox must stop these. */
  it.skipIf(!isMac)('sandbox: a parent path built at run time', () =>
    expectNoCanary(`cat "$(printf '\\056\\056')/outside.txt"`),
  )

  it.skipIf(!isMac)('sandbox: the parent folder from dirname', () =>
    expectNoCanary('P=$(dirname "$PWD"); cat "$P/outside.txt"'),
  )

  it.skipIf(!isMac)('sandbox: a nested shell with a built path', () =>
    expectNoCanary(
      `sh -c "cat \\"\\$(printf '\\\\056\\\\056')/outside.txt\\""`,
    ),
  )

  it.skipIf(!isMac)('sandbox: a write outside built at run time', async () => {
    const result = await exec('cd "$(dirname "$PWD")" && echo x > evil2.txt')
    expect(result.isError).toBe(true)
    expect(existsSync(join(base, 'evil2.txt'))).toBe(false)
  })

  it.skipIf(!isMac)('sandbox: the real home folder is closed', async () => {
    const result = await exec(
      `U=$(printf '\\057Users'); cat "$U/$(id -un)/.zshrc"; ls "$U/$(id -un)"`,
    )
    expect(result.isError).toBe(true)
    expect(result.text).toContain('Operation not permitted')
  })
})

describe('filesystem_bash still works inside the workspace (F-083)', () => {
  it('lists and reads files', async () => {
    const result = await exec('ls && cat in.txt')
    expect(result.isError).toBeUndefined()
    expect(result.text).toContain('in.txt')
    expect(result.text).toContain('inside text')
  })

  it('writes a file and uses a pipe', async () => {
    const result = await exec(
      'mkdir -p sub && echo made > sub/new.txt && cat sub/new.txt | wc -l',
    )
    expect(result.isError).toBeUndefined()
    expect(result.text.trim()).toBe('1')
    expect(await readFile(join(ws, 'sub/new.txt'), 'utf-8')).toBe('made\n')
  })

  it('HOME and TMPDIR are usable', async () => {
    const result = await exec(
      'cat "$HOME/in.txt" && echo t > "$TMPDIR/x" && cat "$TMPDIR/x" && cat ~/in.txt',
    )
    expect(result.isError).toBeUndefined()
    expect(result.text).toContain('inside text')
    expect(result.text).toContain('t')
  })

  it('allows /dev/null and system binaries by path', async () => {
    const result = await exec('/usr/bin/env true > /dev/null && /bin/echo ok')
    expect(result.isError).toBeUndefined()
    expect(result.text.trim()).toBe('ok')
  })

  it('allows an awk pattern and a URL that look like paths', async () => {
    const result = await exec(
      'echo foo | awk \'/foo/ {print "m"}\' && echo https://example.com/a/b',
    )
    expect(result.isError).toBeUndefined()
    expect(result.text).toContain('m')
  })

  it.skipIf(!isMac)('runs git and python3', async () => {
    const result = await exec(
      'git --version && git init -q repo && cd repo && git status --short && echo gitok && python3 -c "print(6*7)"',
    )
    expect(result.isError).toBeUndefined()
    expect(result.text).toContain('git version')
    expect(result.text).toContain('gitok')
    expect(result.text).toContain('42')
  })
})
