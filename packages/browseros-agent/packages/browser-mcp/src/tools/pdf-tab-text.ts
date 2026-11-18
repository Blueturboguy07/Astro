/* Astro 0.2.4 QA, F-070 (UC-24): read, grep and snapshot got no text from a
   tab in Chrome's PDF viewer, so the agent read the paper from screenshots.
   The PDF text comes from the host (the BrowserOS server fetches the PDF and
   uses the same pdfjs path as uploads); this package only asks for it. */

export type PdfTextExtractor = (
  url: string,
  signal?: AbortSignal,
) => Promise<string>

let extractor: PdfTextExtractor | undefined

/** The server sets this at start; undefined turns PDF text off. */
export function setPdfTextExtractor(next: PdfTextExtractor | undefined): void {
  extractor = next
}

export function isPdfUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.pdf')
  } catch {
    return false
  }
}

interface RuntimeLike {
  Runtime: {
    evaluate(params: {
      expression: string
      returnByValue?: boolean
    }): Promise<{ result?: { value?: unknown } }>
  }
}

/** Chrome keeps the original MIME type on the document of a PDF tab. */
async function isPdfDocument(session: RuntimeLike): Promise<boolean> {
  try {
    const result = await session.Runtime.evaluate({
      expression: 'document.contentType',
      returnByValue: true,
    })
    return result.result?.value === 'application/pdf'
  } catch {
    return false
  }
}

export type PdfTabText =
  | { ok: true; text: string; url: string }
  | { ok: false; error: string; url: string }

/**
 * The PDF text of a tab whose page text is empty and that shows a PDF (URL
 * ends in .pdf, or document.contentType is application/pdf). Undefined when
 * the tab is not a PDF.
 */
export async function pdfTabText(options: {
  url: string | undefined
  pageText: string
  session: RuntimeLike
  signal?: AbortSignal
}): Promise<PdfTabText | undefined> {
  const { url, pageText, session, signal } = options
  if (!url || pageText.trim()) return undefined
  if (!isPdfUrl(url) && !(await isPdfDocument(session))) return undefined
  if (!extractor) {
    return { ok: false, url, error: 'PDF text is not available here.' }
  }
  try {
    const text = await extractor(url, signal)
    return text.trim()
      ? { ok: true, url, text }
      : {
          ok: false,
          url,
          error: 'the PDF has no text layer (it may be a scan).',
        }
  } catch (error) {
    return {
      ok: false,
      url,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
