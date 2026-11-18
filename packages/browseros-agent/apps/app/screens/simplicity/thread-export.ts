import type jsPDF from 'jspdf'
import {
  type MarkdownBlock,
  parseMarkdownBlocks,
} from '@/lib/simplicity/utils/markdown-blocks'

/* The thread header's Share > PDF. It wrote each answer's markdown as
   plain text, so the file showed "##", "**" and table pipes, and
   "Exported on" was the chat's start time (Astro 0.2.4 QA, F-063). Now
   the markdown is drawn as headings, lists, quotes, code and real tables. */

export type ThreadTurn = {
  query: string
  askedAt: Date
  /* Raw answer markdown, with `[n]` citation markers. */
  answer: string
  sources: string[]
}

export type ThreadExport = {
  title: string
  exportedAt: Date
  turns: ThreadTurn[]
}

type Block = { type: string; data?: unknown }

/** The answer text of a message: its text blocks without model thinking. */
export const answerMarkdown = (blocks: Block[]): string =>
  blocks
    .filter((b) => b.type === 'text' && typeof b.data === 'string')
    .map((b) =>
      (b.data as string).replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim(),
    )
    .filter(Boolean)
    .join('\n\n')

/** A file name from the thread title: the header's "…" or "..." cut and
    characters that file systems refuse removed. */
export const exportFileName = (title: string, ext: string): string => {
  const base = title
    .replace(/(\.{3}|…)\s*$/, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return `${base || 'chat'}.${ext}`
}

type PdfDoc = Pick<
  jsPDF,
  | 'addPage'
  | 'internal'
  | 'line'
  | 'rect'
  | 'setDrawColor'
  | 'setFont'
  | 'setFontSize'
  | 'setTextColor'
  | 'splitTextToSize'
  | 'text'
>

const LEFT = 12
const WIDTH = 186
const TOP = 15
const MARGIN_BOTTOM = 15

/* Line height in mm for a font size in pt. */
const lineHeight = (size: number) => size * 0.47

type TextStyle = {
  size: number
  x?: number
  width?: number
  style?: 'normal' | 'bold' | 'italic'
  font?: 'helvetica' | 'courier'
  color?: number
  /* Drawn left of the first line (list bullets and numbers). */
  marker?: { text: string; x: number }
}

class PdfCursor {
  /* Top of the next line, in mm. */
  y = TOP

  constructor(private doc: PdfDoc) {}

  private get bottom() {
    return this.doc.internal.pageSize.getHeight() - MARGIN_BOTTOM
  }

  room(height: number) {
    if (this.y + height > this.bottom && this.y > TOP) {
      this.doc.addPage()
      this.y = TOP
    }
  }

  gap(mm: number) {
    this.y += mm
  }

  write(text: string, s: TextStyle) {
    const doc = this.doc
    const x = s.x ?? LEFT
    doc.setFont(s.font ?? 'helvetica', s.style ?? 'normal')
    doc.setFontSize(s.size)
    doc.setTextColor(s.color ?? 30)
    const lh = lineHeight(s.size)
    const lines = doc.splitTextToSize(
      text,
      s.width ?? WIDTH - (x - LEFT),
    ) as string[]
    lines.forEach((line, i) => {
      this.room(lh)
      const baseline = this.y + lh * 0.72
      if (i === 0 && s.marker) doc.text(s.marker.text, s.marker.x, baseline)
      doc.text(line, x, baseline)
      this.y += lh
    })
  }

  rule(color = 200) {
    this.room(4)
    this.doc.setDrawColor(color)
    this.doc.line(LEFT, this.y + 1.5, LEFT + WIDTH, this.y + 1.5)
    this.y += 4
  }

  table(rows: string[][]) {
    const doc = this.doc
    const cols = Math.max(1, ...rows.map((r) => r.length))
    const colWidth = WIDTH / cols
    const size = cols > 4 ? 8.5 : 10
    const lh = lineHeight(size)
    doc.setDrawColor(180)
    doc.setTextColor(30)
    doc.setFontSize(size)
    rows.forEach((row, r) => {
      doc.setFont('helvetica', r === 0 ? 'bold' : 'normal')
      const cells = Array.from(
        { length: cols },
        (_, c) => doc.splitTextToSize(row[c] ?? '', colWidth - 3) as string[],
      )
      const height = Math.max(1, ...cells.map((c) => c.length)) * lh + 2.5
      this.room(height)
      cells.forEach((lines, c) => {
        const x = LEFT + c * colWidth
        doc.rect(x, this.y, colWidth, height)
        lines.forEach((line, k) => {
          doc.text(line, x + 1.5, this.y + 1.25 + lh * k + lh * 0.72)
        })
      })
      this.y += height
    })
    this.y += 3
  }
}

const HEADING_SIZE = [16, 14, 12.5, 12, 11.5, 11]

const drawBlock = (cur: PdfCursor, block: MarkdownBlock) => {
  switch (block.type) {
    case 'heading':
      cur.gap(2)
      cur.write(block.text, {
        size: HEADING_SIZE[block.level - 1] ?? 11,
        style: 'bold',
      })
      cur.gap(1)
      return
    case 'paragraph':
      cur.write(block.text, { size: 11 })
      cur.gap(2)
      return
    case 'item': {
      const markerX = LEFT + 2 + block.depth * 5
      cur.write(block.text, {
        size: 11,
        x: markerX + (block.marker.length > 2 ? 7 : 5),
        marker: { text: block.marker, x: markerX },
      })
      cur.gap(1)
      return
    }
    case 'quote':
      cur.write(block.text, { size: 11, x: LEFT + 5, style: 'italic', color: 90 })
      cur.gap(2)
      return
    case 'code':
      for (const line of block.lines) {
        cur.write(line || ' ', {
          size: 9,
          x: LEFT + 3,
          font: 'courier',
          color: 40,
        })
      }
      cur.gap(2)
      return
    case 'table':
      cur.table(block.rows)
      return
    case 'rule':
      cur.rule(220)
      return
  }
}

export const writeThreadPdf = (doc: PdfDoc, thread: ThreadExport) => {
  const cur = new PdfCursor(doc)
  cur.write(`Chat Export: ${thread.title}`, { size: 18, style: 'bold' })
  cur.gap(1)
  cur.write(`Exported on: ${thread.exportedAt.toLocaleString()}`, {
    size: 11,
    color: 100,
  })
  cur.rule()

  for (const turn of thread.turns) {
    cur.write(`User · ${turn.askedAt.toLocaleString()}`, {
      size: 10,
      style: 'bold',
      color: 110,
    })
    cur.gap(1)
    for (const line of turn.query.split(/\r?\n/)) {
      if (line.trim()) cur.write(line, { size: 12 })
    }
    cur.gap(2)

    if (!turn.answer && turn.sources.length === 0) {
      cur.rule(230)
      continue
    }

    cur.write('Assistant', { size: 10, style: 'bold', color: 110 })
    cur.gap(1)
    for (const block of parseMarkdownBlocks(turn.answer)) drawBlock(cur, block)

    if (turn.sources.length > 0) {
      cur.gap(1)
      cur.write('Citations:', { size: 10, style: 'bold', color: 80 })
      turn.sources.forEach((src, i) => {
        cur.write(`[${i + 1}] ${src}`, { size: 9, x: LEFT + 3, color: 80 })
      })
    }
    cur.gap(2)
    cur.rule(230)
  }
}
