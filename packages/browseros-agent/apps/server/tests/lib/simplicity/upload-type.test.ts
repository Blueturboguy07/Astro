import { describe, expect, it } from 'bun:test'
import { uploadType } from '../../../src/lib/simplicity/uploads/manager'

/* Astro 0.2.4 QA, F-042. */
describe('uploadType', () => {
  it('drops MIME parameters', () => {
    expect(
      uploadType({ type: 'text/plain;charset=utf-8', name: 'a.txt' }),
    ).toBe('text/plain')
  })

  it('uses the extension when the browser sends no type', () => {
    expect(uploadType({ type: '', name: 'Report.DOCX' })).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    expect(
      uploadType({ type: 'application/octet-stream', name: 'x.pdf' }),
    ).toBe('application/pdf')
  })

  it('refuses other files', () => {
    expect(uploadType({ type: 'image/png', name: 'x.png' })).toBe(null)
  })
})
