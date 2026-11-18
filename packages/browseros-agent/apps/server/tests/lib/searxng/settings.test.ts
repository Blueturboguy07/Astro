/**
 * Astro 0.2.4 QA, F-088: the SearXNG settings Astro writes. Engines without
 * an API key, short suspensions, a short request timeout, and a contact URL
 * (Wikipedia and Wikidata do not load without one).
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  CONTACT_URL,
  ensureSettings,
  KEYLESS_ENGINES,
  SETTINGS_VERSION,
  settingsYaml,
} from '../../../src/lib/searxng/settings'

/* The provisioner's first settings (before F-088), as an installed copy has
   them. */
const OLD_SECRET = 'ab'.repeat(32)
const OLD = `use_default_settings: true

general:
  instance_name: 'browseros'

search:
  autocomplete: 'google'
  formats:
    - html
    - json

server:
  secret_key: '${OLD_SECRET}'

outgoing:
  request_timeout: 8.0
  max_request_timeout: 12.0

engines:
  - name: duckduckgo
    disabled: false
`

let dir: string
let file: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-searxng-settings-'))
  file = path.join(dir, 'settings.yml')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('settingsYaml', () => {
  const yml = settingsYaml('cd'.repeat(32))

  it('keeps the JSON format the answer engine needs', () => {
    expect(yml).toContain('  formats:\n    - html\n    - json\n')
    expect(yml).toContain('use_default_settings: true')
  })

  it('turns on every keyless engine', () => {
    for (const name of KEYLESS_ENGINES) {
      expect(yml).toContain(`  - name: ${name}\n    disabled: false`)
    }
    for (const name of [
      'duckduckgo',
      'brave',
      'startpage',
      'mojeek',
      'qwant',
      'yahoo',
      'presearch',
      'wikipedia',
      'wikidata',
    ]) {
      expect(KEYLESS_ENGINES).toContain(name)
    }
  })

  it('sets the contact URL, short timeouts and short suspensions', () => {
    expect(yml).toContain(`  contact_url: '${CONTACT_URL}'`)
    expect(yml).toContain('  request_timeout: 5.0')
    expect(yml).toContain('  max_request_timeout: 8.0')
    expect(yml).toContain('    SearxEngineCaptcha: 300')
    expect(yml).toContain('    SearxEngineTooManyRequests: 60')
    expect(yml).toContain('    cf_SearxEngineCaptcha: 1800')
    expect(yml).toContain('  limiter: false')
  })

  it('starts with the version mark and holds the secret', () => {
    expect(
      yml.startsWith(`# astro-searxng-settings: ${SETTINGS_VERSION}\n`),
    ).toBe(true)
    expect(yml).toContain(`  secret_key: '${'cd'.repeat(32)}'`)
  })
})

describe('ensureSettings', () => {
  it('writes the settings when there are none', () => {
    expect(ensureSettings(file)).toBe('written')
    const yml = fs.readFileSync(file, 'utf8')
    expect(yml).toContain(`contact_url: '${CONTACT_URL}'`)
    expect(yml).toMatch(/secret_key: '[0-9a-f]{64}'/)
  })

  it('updates the settings an older build wrote and keeps the secret', () => {
    fs.writeFileSync(file, OLD)
    expect(ensureSettings(file)).toBe('updated')
    const yml = fs.readFileSync(file, 'utf8')
    expect(yml).toBe(settingsYaml(OLD_SECRET))
  })

  it('keeps current settings as they are', () => {
    fs.writeFileSync(file, OLD)
    ensureSettings(file)
    const before = fs.readFileSync(file, 'utf8')
    expect(ensureSettings(file)).toBe('kept')
    expect(fs.readFileSync(file, 'utf8')).toBe(before)
  })

  it('never touches a settings file Astro did not write', () => {
    const own =
      "use_default_settings: true\ngeneral:\n  instance_name: 'mine'\n"
    fs.writeFileSync(file, own)
    expect(ensureSettings(file)).toBe('kept')
    expect(fs.readFileSync(file, 'utf8')).toBe(own)
  })
})
