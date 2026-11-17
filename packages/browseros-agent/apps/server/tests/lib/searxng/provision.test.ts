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
  it.skipIf(process.platform === 'win32')(
    'the child exits when its parent is gone',
    async () => {
      const { spawn } = await import('node:child_process')
      const src = flaskWithParentWatch('127.0.0.1', 1).replace(
        "runpy.run_module('flask', run_name='__main__', alter_sys=True)",
        'time.sleep(30)',
      )
      /* sh starts python in the background and exits at once: python's
         parent is then gone. */
      const sh = spawn(
        '/bin/sh',
        ['-c', `python3 -c "$SRC" >/dev/null 2>&1 & echo $!`],
        {
          env: { ...process.env, SRC: src },
          stdio: ['ignore', 'pipe', 'ignore'],
        },
      )
      let out = ''
      sh.stdout?.on('data', (d) => {
        out += String(d)
      })
      await new Promise((r) => sh.on('close', r))
      const pid = Number(out.trim())
      expect(pid).toBeGreaterThan(0)
      await new Promise((r) => setTimeout(r, 4500))
      let alive = true
      try {
        process.kill(pid, 0)
      } catch {
        alive = false
      }
      if (alive) process.kill(pid, 'SIGKILL')
      expect(alive).toBe(false)
    },
    15_000,
  )
})
