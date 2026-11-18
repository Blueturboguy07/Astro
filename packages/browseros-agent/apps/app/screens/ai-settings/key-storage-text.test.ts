import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/* Astro 0.2.4 QA, F-038: provider keys are stored in plain text
   (chrome.storage.local and ~/.browseros/simplicity/config.json), so no
   screen may say they are encrypted or stored securely. */

const APP_ROOT = join(import.meta.dir, '../..')
const SKIP = new Set(['node_modules', 'dist', '.output', '.wxt', 'generated'])
const CLAIM =
  /\bkeys? (?:is|are) (?:encrypted|stored securely|kept secure)|encrypted and stored|securely stored|stored (?:securely|encrypted)/i

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (!SKIP.has(name)) out.push(...walk(path))
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(path)
    }
  }
  return out
}

describe('key storage text (F-038)', () => {
  it('no app source says keys are encrypted or stored securely', () => {
    const found: string[] = []
    for (const file of walk(APP_ROOT)) {
      readFileSync(file, 'utf-8')
        .split('\n')
        .forEach((line, i) => {
          if (CLAIM.test(line)) {
            found.push(`${relative(APP_ROOT, file)}:${i + 1}`)
          }
        })
    }
    expect(found).toEqual([])
  })

  it('the add-provider dialog says where the key is and that it is not encrypted', () => {
    const dialog = readFileSync(
      join(import.meta.dir, 'NewProviderDialog.tsx'),
      'utf-8',
    ).replace(/\s+/g, ' ')
    expect(dialog).toContain(
      "Your API key is stored on this computer in Astro's settings, not encrypted.",
    )
  })
})
