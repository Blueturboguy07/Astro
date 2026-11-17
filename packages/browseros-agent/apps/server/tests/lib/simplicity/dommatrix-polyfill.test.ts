import { describe, expect, it } from 'bun:test'
import { Matrix2D } from '../../../src/lib/simplicity/uploads/dommatrix-polyfill'

/* Astro 0.2.4 QA, F-042: the compiled server has no DOMMatrix, so PDF
   uploads failed. Checked against a compiled probe: without the polyfill
   pdf-parse throws "DOMMatrix is not defined", with it the text of
   hello-upload.pdf comes out. Here: the math pdfjs relies on. */
describe('Matrix2D', () => {
  it('multiplies, translates, scales and inverts like DOMMatrix', () => {
    const m = new Matrix2D([2, 0, 0, 3, 10, 20])
    expect(m.transformPoint({ x: 1, y: 1 })).toMatchObject({ x: 12, y: 23 })
    const t = m.translate(5, 5)
    expect([t.e, t.f]).toEqual([20, 35])
    const inv = m.inverse()
    const p = inv.transformPoint(m.transformPoint({ x: 7, y: -4 }))
    expect(p.x).toBeCloseTo(7)
    expect(p.y).toBeCloseTo(-4)
    expect(new Matrix2D().scale(2).a).toBe(2)
    expect(new Matrix2D().isIdentity).toBe(true)
  })

  it('lets pdf-parse read a PDF with it in place', async () => {
    const g = globalThis as { DOMMatrix?: unknown }
    const saved = g.DOMMatrix
    g.DOMMatrix = Matrix2D
    try {
      const [{ PDFParse }, { CanvasFactory }] = await Promise.all([
        import('pdf-parse'),
        import('pdf-parse/worker'),
      ])
      const data = await Bun.file(
        new URL('./hello-upload.pdf', import.meta.url),
      ).bytes()
      const parser = new PDFParse({ data, CanvasFactory })
      const { text } = await parser.getText()
      expect(text).toContain('Hello Astro upload test')
    } finally {
      g.DOMMatrix = saved
    }
  })
})
