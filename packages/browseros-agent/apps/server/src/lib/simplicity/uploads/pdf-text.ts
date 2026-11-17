/// <reference path="./pdf-worker.d.ts" />
import { ensureDOMMatrix } from './dommatrix-polyfill'

/* Astro 0.2.4 QA, F-042: PDF text that works inside the bun-compiled server.

   pdf-parse needed `pdf-parse/worker`, which loads @napi-rs/canvas. The
   compiled server refuses native addons (native-addon-guard.ts), so the upload
   failed with "Failed to load native binding". Without that import, pdfjs
   falls back to a "fake worker" that does `import('./pdf.worker.mjs')` at run
   time, a file that is not inside the binary.

   Here: pdfjs-dist (legacy build) directly, no canvas, and the worker module
   imported by a literal specifier so the bundler puts it into the binary.
   pdfjs uses `globalThis.pdfjsWorker` before it tries any import of its own. */

type WorkerModule = { WorkerMessageHandler: unknown }

let workerReady: Promise<void> | null = null

function ensurePdfWorker(): Promise<void> {
  workerReady ??= (async () => {
    const g = globalThis as { pdfjsWorker?: WorkerModule }
    if (g.pdfjsWorker?.WorkerMessageHandler) return
    g.pdfjsWorker = (await import(
      'pdfjs-dist/legacy/build/pdf.worker.mjs'
    )) as WorkerModule
  })().catch((error) => {
    workerReady = null
    throw error
  })
  return workerReady
}

type TextItem = { str?: string; hasEOL?: boolean }

/** Joins the text items of one page; a line end becomes a newline. */
export function joinTextItems(items: readonly TextItem[]): string {
  let out = ''
  for (const item of items) {
    if (typeof item.str !== 'string') continue
    out += item.str
    if (item.hasEOL) out += '\n'
  }
  return out.trim()
}

/** All text of a PDF, pages separated by a blank line. */
export async function extractPdfText(data: Uint8Array): Promise<string> {
  /* Before pdfjs loads: the compiled server has no DOMMatrix. */
  ensureDOMMatrix()
  await ensurePdfWorker()
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

  const doc = await pdfjs.getDocument({
    /* pdfjs takes ownership of (and detaches) the buffer it gets. */
    data: new Uint8Array(data),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    verbosity: 0,
  }).promise

  try {
    const pages: string[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      pages.push(joinTextItems(content.items as TextItem[]))
      page.cleanup()
    }
    return pages.filter(Boolean).join('\n\n')
  } finally {
    await doc.destroy()
  }
}
