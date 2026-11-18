/**
 * @license
 * Copyright 2026 publik
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * F-038 (Astro 0.2.4 QA): $HOME/.browseros/simplicity/config.json holds the
 * publik pk_ key and the person's own provider keys in plain text, and was
 * written 0644 (any local user could read it). The file is now 0600 and its
 * folder 0700, also for a file an earlier build left behind.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getBrowserosDir } from '../../../src/lib/browseros-dir'
import {
  CONFIG_DIR_MODE,
  CONFIG_FILE_MODE,
  ConfigManager,
} from '../../../src/lib/simplicity/config'

const mode = (p: string) => statSync(p).mode & 0o777
const posix = process.platform !== 'win32'

/* A temp home with its own .browseros. Bun's os.homedir() does not follow
   $HOME, so the data dir is pointed there through BROWSEROS_DIR, and every
   test checks it before it builds a ConfigManager: a test must never write
   the real ~/.browseros. */
let home = ''
const saved = {
  BROWSEROS_DIR: process.env.BROWSEROS_DIR,
  DATA_DIR: process.env.DATA_DIR,
}

function newConfig(): ConfigManager {
  const dir = getBrowserosDir()
  if (!home || !dir.startsWith(home)) {
    throw new Error(`refusing to write outside the temp home: ${dir}`)
  }
  return new ConfigManager()
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'astro-config-mode-'))
  process.env.BROWSEROS_DIR = join(home, '.browseros')
  delete process.env.DATA_DIR
})

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  rmSync(home, { recursive: true, force: true })
})

describe.if(posix)('config.json file mode (F-038)', () => {
  it('a new config.json under $HOME/.browseros is 0600 in a 0700 folder', () => {
    const config = newConfig()
    const dir = join(home, '.browseros', 'simplicity')
    expect(config.configPath).toBe(join(dir, 'config.json'))
    expect(mode(config.configPath)).toBe(CONFIG_FILE_MODE)
    expect(mode(dir)).toBe(CONFIG_DIR_MODE)
  })

  it('a key written later keeps 0600, and no temp file is left', () => {
    const config = newConfig()
    config.addModelProvider('openai', 'Mine', { apiKey: 'sk-test-not-real' })
    config.updateConfig('preferences.theme', 'light')
    expect(mode(config.configPath)).toBe(CONFIG_FILE_MODE)
    expect(
      readdirSync(join(home, '.browseros', 'simplicity')).filter((f) =>
        f.endsWith('.tmp'),
      ),
    ).toEqual([])
  })

  it('fixes a 0644 file and a 0755 folder from an earlier build at start', () => {
    const dir = join(home, '.browseros', 'simplicity')
    mkdirSync(dir, { recursive: true })
    chmodSync(dir, 0o755)
    const file = join(dir, 'config.json')
    writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        setupComplete: true,
        preferences: {},
        personalization: {},
        modelProviders: [],
        search: { searxngURL: '' },
      }),
    )
    chmodSync(file, 0o644)

    const config = newConfig()
    expect(config.isSetupComplete()).toBe(true)
    expect(mode(file)).toBe(CONFIG_FILE_MODE)
    expect(mode(dir)).toBe(CONFIG_DIR_MODE)
  })

  it('a corrupt file is backed up 0600', () => {
    const dir = join(home, '.browseros', 'simplicity')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'config.json')
    writeFileSync(file, '{ not json')
    chmodSync(file, 0o644)

    newConfig()
    const backups = readdirSync(dir).filter((f) =>
      f.startsWith('config.json.corrupt-'),
    )
    expect(backups.length).toBe(1)
    expect(mode(join(dir, backups[0] as string))).toBe(CONFIG_FILE_MODE)
    expect(mode(file)).toBe(CONFIG_FILE_MODE)
  })
})
