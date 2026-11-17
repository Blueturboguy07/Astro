import { describe, expect, it } from 'bun:test'
import {
  extractPdfText,
  joinTextItems,
} from '../../../src/lib/simplicity/uploads/pdf-text'

/* Astro 0.2.4 QA, F-042 (round 3): the text path itself, in dev. The
   compiled-binary check is in pdf-upload-compiled.test.ts. */
describe('extractPdfText', () => {
  it('joins text items, a line end becomes a newline', () => {
    expect(
      joinTextItems([
        { str: 'Line one', hasEOL: true },
        { str: 'Line ' },
        { str: 'two', hasEOL: false },
        {},
      ]),
    ).toBe('Line one\nLine two')
  })

  it('reads the text of a PDF without canvas or a worker file', async () => {
    const data = await Bun.file(
      new URL('./hello-upload.pdf', import.meta.url),
    ).bytes()
    const text = await extractPdfText(data)
    expect(text).toContain('Hello Astro upload test')
    /* The caller's buffer stays usable: pdfjs gets a copy. */
    expect(data.byteLength).toBeGreaterThan(0)
  })

  it('rejects a file that is not a PDF', async () => {
    await expect(
      extractPdfText(new TextEncoder().encode('not a pdf')),
    ).rejects.toThrow()
  })
})
