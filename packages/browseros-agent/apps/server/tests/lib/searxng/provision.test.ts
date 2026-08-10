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
import { clearQuarantine } from '../../../src/lib/searxng/provision'

// Regression coverage for the macOS Gatekeeper block reported against the
// downloaded, unsigned python-build-standalone CPython — see clearQuarantine's
// doc comment in provision.ts.
describe('clearQuarantine', () => {
  it('is a no-op on non-macOS platforms (never shells out to /usr/bin/xattr)', () => {
    if (process.platform === 'darwin') return

    const dir = mkdtempSync(join(tmpdir(), 'clear-quarantine-'))
    try {
      // Would throw (ENOENT, no such binary) on Linux/Windows if the darwin
      // guard didn't short-circuit before reaching execFileSync.
      expect(() => clearQuarantine(dir)).not.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('removes a real com.apple.quarantine attribute recursively', () => {
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

      clearQuarantine(dir)

      expect(execFileSync('/usr/bin/xattr', [file]).toString().trim()).toBe('')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('does not throw when there is nothing to clear', () => {
    if (process.platform !== 'darwin') return

    const dir = mkdtempSync(join(tmpdir(), 'clear-quarantine-'))
    try {
      expect(() => clearQuarantine(dir)).not.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
