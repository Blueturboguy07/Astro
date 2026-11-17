import { afterAll, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveUploadPaths } from './upload-paths'

const home = mkdtempSync(join(tmpdir(), 'upload-home-'))
mkdirSync(join(home, 'Downloads'))
writeFileSync(join(home, 'Downloads', 'cv.pdf'), '%PDF-1.4 test')
writeFileSync(join(home, 'empty.txt'), '')
afterAll(() => rmSync(home, { recursive: true, force: true }))

describe('resolveUploadPaths (F-074)', () => {
  it('expands ~ to the home folder', () => {
    expect(resolveUploadPaths(['~/Downloads/cv.pdf'], home)).toEqual({
      paths: [join(home, 'Downloads', 'cv.pdf')],
    })
  })

  it('refuses a missing file with a clear error', () => {
    const r = resolveUploadPaths(['~/Downloads/none.pdf'], home)
    expect('error' in r && r.error).toContain(
      'no file at "~/Downloads/none.pdf"',
    )
  })

  it('refuses an empty file, a folder and a relative path', () => {
    expect(JSON.stringify(resolveUploadPaths(['~/empty.txt'], home))).toContain(
      'is empty (0 bytes)',
    )
    expect(JSON.stringify(resolveUploadPaths(['~/Downloads'], home))).toContain(
      'is a folder',
    )
    expect(JSON.stringify(resolveUploadPaths(['cv.pdf'], home))).toContain(
      'is not a full path',
    )
  })
})
