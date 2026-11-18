import { stripInlineMarkdown } from './markdown-inline'
import { isSeparatorRow, isTableRow, splitRow } from './markdownTables'

/* An answer's markdown as plain-text blocks, for the Share > PDF export:
   jsPDF draws text only, and it printed the raw markdown ("##", "**",
   table pipes) (Astro 0.2.4 QA, F-063). Line-based and dependency-free,
   like markdownTables.ts; inline markup is stripped, block structure is
   kept so the PDF can style it. */
export type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'item'; marker: string; depth: number; text: string }
  | { type: 'quote'; text: string }
  | { type: 'code'; lines: string[] }
  | { type: 'table'; rows: string[][] }
  | { type: 'rule' }

const FENCE = /^\s*(```|~~~)/
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const BULLET = /^(\s*)[-*+]\s+(.*)$/
const ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/
const QUOTE = /^\s{0,3}>\s?(.*)$/

const depthOf = (indent: string) =>
  Math.min(Math.floor(indent.replace(/\t/g, '  ').length / 2), 4)

type OpenBlock = Extract<
  MarkdownBlock,
  { type: 'paragraph' | 'quote' | 'item' }
>

export const parseMarkdownBlocks = (markdown: string): MarkdownBlock[] => {
  const lines = markdown.split(/\r?\n/)
  const blocks: MarkdownBlock[] = []
  /* The open paragraph, quote or list item that a following plain line
     continues; a blank line or any other block closes it. */
  let open: OpenBlock | null = null
  /* `push` sets `open` inside a closure, which TypeScript's narrowing does
     not see; read it through this. */
  const current = () => open as OpenBlock | null

  const push = (block: MarkdownBlock) => {
    blocks.push(block)
    open =
      block.type === 'paragraph' ||
      block.type === 'quote' ||
      block.type === 'item'
        ? block
        : null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const fence = line.match(FENCE)
    if (fence) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) {
        code.push(lines[i])
        i++
      }
      push({ type: 'code', lines: code })
      continue
    }

    if (line.trim() === '') {
      open = null
      continue
    }

    const next = lines[i + 1]
    if (isTableRow(line) && next !== undefined && isSeparatorRow(next)) {
      const rows = [splitRow(line).map(stripInlineMarkdown)]
      i += 2
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        isTableRow(lines[i])
      ) {
        rows.push(splitRow(lines[i]).map(stripInlineMarkdown))
        i++
      }
      i--
      push({ type: 'table', rows })
      continue
    }

    const heading = line.match(HEADING)
    if (heading) {
      push({
        type: 'heading',
        level: heading[1].length,
        text: stripInlineMarkdown(heading[2]),
      })
      continue
    }

    if (RULE.test(line)) {
      push({ type: 'rule' })
      continue
    }

    const bullet = line.match(BULLET)
    if (bullet) {
      push({
        type: 'item',
        marker: '•',
        depth: depthOf(bullet[1]),
        text: stripInlineMarkdown(bullet[2]),
      })
      continue
    }

    const ordered = line.match(ORDERED)
    if (ordered) {
      push({
        type: 'item',
        marker: `${ordered[2]}.`,
        depth: depthOf(ordered[1]),
        text: stripInlineMarkdown(ordered[3]),
      })
      continue
    }

    const quote = line.match(QUOTE)
    if (quote) {
      const text = stripInlineMarkdown(quote[1])
      const prev = current()
      if (prev?.type === 'quote') prev.text = `${prev.text} ${text}`.trim()
      else push({ type: 'quote', text })
      continue
    }

    const text = stripInlineMarkdown(line)
    const prev = current()
    if (prev) prev.text = `${prev.text} ${text}`.trim()
    else push({ type: 'paragraph', text })
  }

  return blocks
}
