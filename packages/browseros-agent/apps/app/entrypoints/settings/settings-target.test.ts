import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { OPTIONS_PAGE, SETTINGS_PAGE_PATH } from './settings-target'

/* Astro 0.2.4 QA, F-091 (d): openOptionsPage opened Home. */
describe('options page', () => {
  const config = readFileSync(
    join(import.meta.dir, '../../wxt.config.ts'),
    'utf-8',
  )

  it('is its own page, not app.html (the new tab page)', () => {
    expect(OPTIONS_PAGE).not.toContain('app.html')
    expect(config).toContain(`page: '${OPTIONS_PAGE}'`)
    expect(config).not.toContain("page: 'app.html#/settings'")
  })

  it('sends the person to Settings', () => {
    expect(SETTINGS_PAGE_PATH).toBe('/app.html#/settings')
  })
})
