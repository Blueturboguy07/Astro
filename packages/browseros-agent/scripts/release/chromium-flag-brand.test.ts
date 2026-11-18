import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/* F-010 (rest), Astro 0.2.4 QA: chrome://flags showed "BrowserOS Alpha
   Features" and "BrowserOS Keyboard Shortcuts". The names come from this
   Chromium patch, so the next Chromium build shows Astro. */
const PATCH = path.join(
  import.meta.dir,
  '../../../browseros/chromium_patches/chrome/browser/flag_descriptions.h',
)

describe('chrome://flags names in the Chromium patch (F-010)', () => {
  const added = readFileSync(PATCH, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
  const literals = added.flatMap((l) => l.match(/"[^"]*"/g) ?? [])

  it('the visible strings say Astro, not BrowserOS', () => {
    expect(literals.length).toBeGreaterThan(3)
    expect(literals.filter((s) => /BrowserOS|BrowserClaw/.test(s))).toEqual([])
    expect(literals).toContain('"Astro Alpha Features"')
    expect(literals).toContain('"Astro Keyboard Shortcuts"')
  })

  it('the hunk still adds 12 lines (header counts unchanged)', () => {
    const text = readFileSync(PATCH, 'utf8')
    expect(text).toContain('@@ -291,6 +291,18 @@')
    expect(added.length).toBe(12)
  })
})
