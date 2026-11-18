import { afterEach, describe, expect, it } from 'bun:test'
import type { BrowserSession } from '@browseros/browser-core/core/session'
import { executeTool } from './framework'
import { grep } from './grep'
import { setPdfTextExtractor } from './pdf-tab-text'
import { read } from './read'

/* Astro 0.2.4 QA, F-070: PDF tabs (UC-24) and attribute-only data (UC-31). */

const PDF_URL = 'https://arxiv.org/pdf/1706.03762'
const PAPER =
  'Attention Is All You Need\nThe dominant sequence transduction models'

function fakeSession(options: {
  url: string
  contentType?: string
  value?: (expression: string) => string
}) {
  const expressions: string[] = []
  const session = {
    pages: {
      getSession: async () => ({
        session: {
          Runtime: {
            evaluate: async ({ expression }: { expression: string }) => {
              expressions.push(expression)
              if (expression === 'document.contentType') {
                return { result: { value: options.contentType ?? 'text/html' } }
              }
              return { result: { value: options.value?.(expression) ?? '' } }
            },
          },
        },
      }),
      getInfo: () => ({ url: options.url }),
    },
  } as unknown as BrowserSession
  return { session, expressions }
}

function textOf(result: { content?: unknown }): string {
  return ((result.content as Array<{ type: string; text?: string }>) ?? [])
    .map((item) => item.text ?? '')
    .join('\n')
}

afterEach(() => setPdfTextExtractor(undefined))

describe('read on a PDF tab', () => {
  it("returns the PDF's text when Chrome's viewer gives no page text", async () => {
    const asked: string[] = []
    setPdfTextExtractor(async (url) => {
      asked.push(url)
      return PAPER
    })
    const { session } = fakeSession({
      url: PDF_URL,
      contentType: 'application/pdf',
    })
    const result = await executeTool(read, { page: 1 }, { session })
    expect(result.isError).toBeFalsy()
    expect(textOf(result)).toContain('Attention Is All You Need')
    expect(result.structuredContent).toMatchObject({ pdf: true })
    expect(asked).toEqual([PDF_URL])
  })

  it('treats a URL ending in .pdf as a PDF without asking for the type', async () => {
    setPdfTextExtractor(async () => PAPER)
    const { session, expressions } = fakeSession({
      url: 'https://example.com/files/paper.PDF?dl=1',
    })
    const result = await executeTool(
      read,
      { page: 1, format: 'text' },
      { session },
    )
    expect(textOf(result)).toContain('Attention Is All You Need')
    expect(expressions).not.toContain('document.contentType')
  })

  it('reports a PDF it cannot read as an error, not as an empty page', async () => {
    setPdfTextExtractor(async () => {
      throw new Error('the site answered HTTP 403')
    })
    const { session } = fakeSession({
      url: PDF_URL,
      contentType: 'application/pdf',
    })
    const result = await executeTool(read, { page: 1 }, { session })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe(
      `read: this tab shows a PDF (${PDF_URL}), but its text could not be read: the site answered HTTP 403`,
    )
  })

  it('leaves an empty HTML page alone', async () => {
    let calls = 0
    setPdfTextExtractor(async () => {
      calls++
      return PAPER
    })
    const { session } = fakeSession({ url: 'https://example.com/' })
    const result = await executeTool(read, { page: 1 }, { session })
    expect(textOf(result)).toContain('(empty)')
    expect(calls).toBe(0)
  })
})

describe('attributes in read and grep', () => {
  const lines = [
    'p class="star-rating Three"',
    'a title="A Light in the Attic" | A Light in the ...',
    'p class="star-rating One"',
    'a title="Tipping the Velvet" | Tipping the Velvet',
  ].join('\n')

  it('read format="attributes" runs the attribute list script', async () => {
    const { session, expressions } = fakeSession({
      url: 'https://books.toscrape.com/',
      value: (expression) => (expression.includes('aria-hidden') ? lines : ''),
    })
    const result = await executeTool(
      read,
      { page: 1, format: 'attributes' },
      { session },
    )
    expect(textOf(result)).toContain('p class="star-rating Three"')
    expect(expressions[0]).toContain("indexOf('data-')")
  })

  it('grep over="attributes" pairs each rating with its title', async () => {
    const { session } = fakeSession({
      url: 'https://books.toscrape.com/',
      value: (expression) => (expression.includes('aria-hidden') ? lines : ''),
    })
    const result = await executeTool(
      grep,
      { page: 1, pattern: 'star-rating|title=', over: 'attributes' },
      { session },
    )
    expect(result.structuredContent).toMatchObject({
      over: 'attributes',
      count: 4,
    })
  })

  it('grep over="content" searches the PDF text of a PDF tab', async () => {
    setPdfTextExtractor(async () => PAPER)
    const { session } = fakeSession({
      url: PDF_URL,
      contentType: 'application/pdf',
    })
    const result = await executeTool(
      grep,
      { page: 1, pattern: 'transduction', over: 'content' },
      { session },
    )
    expect(result.structuredContent).toMatchObject({ count: 1 })
  })

  it('read and grep stay read-only tools (Chat Mode keeps them)', () => {
    expect(read.annotations?.readOnlyHint).toBe(true)
    expect(grep.annotations?.readOnlyHint).toBe(true)
  })
})
