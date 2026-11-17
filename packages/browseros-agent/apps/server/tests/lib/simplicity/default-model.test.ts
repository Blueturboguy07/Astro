/**
 * @license
 * Copyright 2026 publik
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * F-001 (Astro 0.2.4 QA): after "Connect your plan" the answer engine chose
 * "Claude Sonnet 5" from a "Claude (your account)" connection that appeared
 * by itself, and the first question failed with "Claude Code error: Not
 * logged in". Three causes, one test each:
 *   - the config added every provider without a required field at each
 *     start (Claude Code has none);
 *   - a signed-out CLI still listed its models;
 *   - "Best" ranked Claude Code above publik.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveBest } from '../../../src/lib/simplicity/models/catalog'
import ClaudeCodeProvider from '../../../src/lib/simplicity/models/providers/claudecode'
import {
  checkClaudeCodeSignedIn,
  clearClaudeCodeSignInCache,
  interpretAuthStatus,
} from '../../../src/lib/simplicity/models/providers/claudecode/claudeCodeLLM'

const publik = {
  id: 'p1',
  type: 'openai',
  name: 'publik API',
  chatModels: [
    { key: 'publik-balanced', name: 'publik Balanced' },
    { key: 'publik-fast', name: 'publik Fast' },
    { key: 'publik-smart', name: 'publik Smart' },
  ],
  embeddingModels: [],
}
const claude = {
  id: 'c1',
  type: 'claudecode',
  name: 'Claude (your account)',
  chatModels: [
    { key: 'opus', name: 'Claude Opus' },
    { key: 'sonnet', name: 'Claude Sonnet' },
  ],
  embeddingModels: [],
}

describe('config: providers from the environment', () => {
  let dir: string
  const saved = { ...process.env }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'simplicity-config-'))
    process.env.DATA_DIR = dir
    for (const k of Object.keys(process.env)) {
      if (/(_API_KEY|_BASE_URL|_URL)$/.test(k) && k !== 'DATA_DIR') {
        delete process.env[k]
      }
    }
  })

  afterEach(() => {
    process.env = { ...saved }
    rmSync(dir, { recursive: true, force: true })
  })

  it('does not add a Claude Code connection by itself on a fresh start', async () => {
    const { default: configManager } = await import(
      `../../../src/lib/simplicity/config?fresh=${Date.now()}`
    )
    const providers = configManager.getConfig('modelProviders', []) as {
      type: string
    }[]
    expect(providers.map((p) => p.type)).not.toContain('claudecode')
    expect(providers).toHaveLength(0)
  })

  it('still adds a provider whose key comes from the environment', async () => {
    process.env.GROQ_API_KEY = 'gsk_test_only'
    const { default: configManager } = await import(
      `../../../src/lib/simplicity/config?fresh=${Date.now()}`
    )
    const providers = configManager.getConfig('modelProviders', []) as {
      type: string
    }[]
    expect(providers.map((p) => p.type)).toEqual(['groq'])
  })
})

describe('Claude Code sign-in check', () => {
  afterEach(() => clearClaudeCodeSignInCache())

  it('reads loggedIn from `claude auth status`', () => {
    expect(interpretAuthStatus(1, '{"loggedIn": false}').ok).toBe(false)
    expect(interpretAuthStatus(0, '{"loggedIn": true}').ok).toBe(true)
  })

  it('keeps an older CLI without the subcommand (no verdict)', () => {
    expect(interpretAuthStatus(1, 'error: unknown command').ok).toBe(true)
  })

  it('treats a CLI that cannot run as not usable', () => {
    expect(interpretAuthStatus(null, '').ok).toBe(false)
  })

  it('caches the answer for a minute', async () => {
    let calls = 0
    let t = 0
    const run = async () => {
      calls++
      return { code: 1, stdout: '{"loggedIn": false}' }
    }
    await checkClaudeCodeSignedIn('/x/claude', run, () => t)
    t = 30_000
    await checkClaudeCodeSignedIn('/x/claude', run, () => t)
    expect(calls).toBe(1)
    t = 61_000
    await checkClaudeCodeSignedIn('/x/claude', run, () => t)
    expect(calls).toBe(2)
  })

  it('a signed-out CLI lists no models, so the picker never offers it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fake-claude-'))
    const bin = join(dir, 'claude')
    writeFileSync(
      bin,
      '#!/bin/sh\necho \'{"loggedIn": false, "authMethod": "none"}\'\nexit 1\n',
    )
    chmodSync(bin, 0o755)
    try {
      const provider = new ClaudeCodeProvider('c1', 'Claude (your account)', {
        binary: bin,
      })
      await expect(provider.getModelList()).rejects.toThrow(/not signed in/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a signed-in CLI lists its models', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fake-claude-'))
    const bin = join(dir, 'claude')
    writeFileSync(bin, '#!/bin/sh\necho \'{"loggedIn": true}\'\n')
    chmodSync(bin, 0o755)
    try {
      const provider = new ClaudeCodeProvider('c1', 'Claude (your account)', {
        binary: bin,
      })
      const list = await provider.getModelList()
      expect(list.chat.map((m) => m.key)).toContain('sonnet')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('Best', () => {
  it('prefers publik Balanced over a connected Claude Code', () => {
    expect(resolveBest([claude, publik])).toEqual({
      providerId: 'p1',
      key: 'publik-balanced',
    })
  })

  it('falls back to Claude Code when publik is not connected', () => {
    expect(resolveBest([claude])).toEqual({ providerId: 'c1', key: 'sonnet' })
  })
})
