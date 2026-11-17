/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  clearQuarantine,
  ensureNoQuarantine,
  findQuarantined,
  flaskWithParentWatch,
} from '../../../src/lib/searxng/provision'

// Regression coverage for the macOS Gatekeeper block reported against the
// downloaded, unsigned python-build-standalone CPython — see clearQuarantine's
// doc comment in provision.ts.
describe('clearQuarantine', () => {
  it('is a no-op on non-macOS platforms (never shells out to /usr/bin/xattr)', async () => {
    if (process.platform === 'darwin') return

    const dir = mkdtempSync(join(tmpdir(), 'clear-quarantine-'))
    try {
      // Would throw (ENOENT, no such binary) on Linux/Windows if the darwin
      // guard didn't short-circuit before reaching execFileSync.
      await expect(clearQuarantine(dir)).resolves.toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('removes a real com.apple.quarantine attribute recursively', async () => {
    if (process.platform !== 'darwin') return

    const dir = mkdtempSync(join(tmpdir(), 'clear-quarantine-'))
    const file = join(dir, 'python3')
    try {
      writeFileSync(file, '#!/bin/sh\necho fake-python\n')
      execFileSync('/usr/bin/xattr', [
        '-w',
        'com.apple.quarantine',
        '0081;00000000;BrowserOS;',
        file,
      ])
      expect(execFileSync('/usr/bin/xattr', [file]).toString()).toContain(
        'com.apple.quarantine',
      )

      await clearQuarantine(dir)

      /* Only the quarantine flag: macOS may add others (com.apple.provenance). */
      expect(execFileSync('/usr/bin/xattr', [file]).toString()).not.toContain(
        'com.apple.quarantine',
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('does not throw when there is nothing to clear', async () => {
    if (process.platform !== 'darwin') return

    const dir = mkdtempSync(join(tmpdir(), 'clear-quarantine-'))
    try {
      await expect(clearQuarantine(dir)).resolves.toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

/* F-002: nothing downloaded may run while any file still has the flag. */
describe('ensureNoQuarantine', () => {
  it('refuses when a file is still quarantined after the clear', async () => {
    await expect(
      ensureNoQuarantine('/data/searxng', {
        platform: 'darwin',
        clear: async () => {},
        find: async () => '/data/searxng/python/bin/python3.12',
      }),
    ).rejects.toThrow(
      'macOS still marks python/bin/python3.12 as downloaded, so Astro did not run it',
    )
  })

  it('passes when nothing is left', async () => {
    await ensureNoQuarantine('/data/searxng', {
      platform: 'darwin',
      clear: async () => {},
      find: async () => null,
    })
  })

  it('does nothing off macOS', async () => {
    let called = false
    await ensureNoQuarantine('x', {
      platform: 'linux',
      clear: async () => {
        called = true
      },
      find: async () => {
        called = true
        return 'x'
      },
    })
    expect(called).toBe(false)
  })

  it.skipIf(process.platform !== 'darwin')(
    'clears and verifies a real quarantined tree',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'astro-quarantine-'))
      try {
        const f = join(dir, 'python3.12')
        writeFileSync(f, '#!/bin/sh\n')
        execFileSync('/usr/bin/xattr', [
          '-w',
          'com.apple.quarantine',
          '0081;00000000;Astro;',
          f,
        ])
        expect(await findQuarantined(dir)).toBe(f)
        await ensureNoQuarantine(dir)
        expect(await findQuarantined(dir)).toBe(null)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  )
})

/* F-073: SearXNG stayed alive with no parent after the server was killed. */
describe('flaskWithParentWatch', () => {
  const run = async (parentPid: number) => {
    const { spawn } = await import('node:child_process')
    const src = flaskWithParentWatch('127.0.0.1', 1, parentPid).replace(
      "runpy.run_module('flask', run_name='__main__', alter_sys=True)",
      'time.sleep(30)',
    )
    const child = spawn('/usr/bin/python3', ['-c', src], { stdio: 'ignore' })
    const exited = new Promise<boolean>((r) => child.on('exit', () => r(true)))
    const result = await Promise.race([
      exited,
      new Promise<boolean>((r) => setTimeout(() => r(false), 4500)),
    ])
    if (!result) child.kill('SIGKILL')
    return result
  }

  it.skipIf(process.platform !== 'darwin')(
    'exits when its parent is not the server any more',
    async () => {
      expect(await run(999_999)).toBe(true)
    },
    15_000,
  )

  it.skipIf(process.platform !== 'darwin')(
    'keeps running while the server is its parent',
    async () => {
      expect(await run(process.pid)).toBe(false)
    },
    15_000,
  )
})
