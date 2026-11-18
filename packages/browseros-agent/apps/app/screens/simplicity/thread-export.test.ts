import { describe, expect, it, mock } from 'bun:test'
import * as blocks from '../../lib/simplicity/utils/markdown-blocks'

mock.module('@/lib/simplicity/utils/markdown-blocks', () => blocks)

const { answerMarkdown, exportFileName, writeThreadPdf } = await import(
  './thread-export'
)

const fakeDoc = () => {
  const texts: string[] = []
  const doc = {
    internal: { pageSize: { height: 297, getHeight: () => 297 } },
    addPage: () => doc,
    line: () => doc,
    rect: () => doc,
    setDrawColor: () => doc,
    setFont: () => doc,
    setFontSize: () => doc,
    setTextColor: () => doc,
    splitTextToSize: (t: string) => [t],
    text: (t: string | string[]) => {
      texts.push(...(Array.isArray(t) ? t : [t]))
      return doc
    },
  }
  return { doc, texts }
}

describe('Share > PDF (F-063)', () => {
  it('draws the answer markdown without raw ## or ** or table pipes', () => {
    const { doc, texts } = fakeDoc()
    writeThreadPdf(doc as never, {
      title: 'Python vs Go',
      exportedAt: new Date('2026-11-17T20:00:00Z'),
      turns: [
        {
          query: 'Compare Python and Go',
          askedAt: new Date('2026-11-17T19:00:00Z'),
          answer:
            '## Summary\n\nPython is **easy** [1].\n\n| **Aspect** | Go |\n|---|---|\n| Speed | fast |',
          sources: ['https://go.dev'],
        },
      ],
    })
    const all = texts.join('\n')
    expect(all).toContain('Summary')
    expect(all).toContain('Aspect')
    expect(all).toContain('[1] https://go.dev')
    expect(all).not.toContain('##')
    expect(all).not.toContain('**')
    expect(all).not.toMatch(/\|\s*Speed/)
  })

  it('answerMarkdown drops thinking; file names lose the "…" and bad characters', () => {
    expect(
      answerMarkdown([
        { type: 'text', data: '<think>plan</think>Answer' },
        { type: 'source', data: [] },
      ]),
    ).toBe('Answer')
    expect(exportFileName('What is a/b: test…', 'pdf')).toBe(
      'What is a b test.pdf',
    )
    expect(exportFileName('', 'md')).toBe('chat.md')
  })
})
