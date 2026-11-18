import { describe, expect, it } from 'bun:test'
import { parseMarkdownBlocks } from './markdown-blocks'
import { stripInlineMarkdown } from './markdown-inline'
import { markdownTablesToCsv } from './markdownTables'

describe('stripInlineMarkdown (F-063)', () => {
  it('removes bold, italic, code, links and strike markers', () => {
    expect(stripInlineMarkdown('**Aspect**')).toBe('Aspect')
    expect(stripInlineMarkdown('_one_ and *two* `three`')).toBe(
      'one and two three',
    )
    expect(stripInlineMarkdown('[Python](https://python.org) ~~old~~')).toBe(
      'Python old',
    )
  })

  it('keeps math and snake_case names', () => {
    expect(stripInlineMarkdown('2*3*4')).toBe('2*3*4')
    expect(stripInlineMarkdown('snake_case_name')).toBe('snake_case_name')
  })
})

describe('CSV export cells (F-063)', () => {
  it('the header has no ** markers', () => {
    const csv = markdownTablesToCsv(
      '| **Aspect** | **Python** |\n|---|---|\n| Typing | *dynamic* |',
    )
    expect(csv.split('\n')[0]).toBe('Aspect,Python')
    expect(csv).not.toContain('*')
  })
})

describe('parseMarkdownBlocks (Share PDF, F-063)', () => {
  it('turns markdown into styled blocks with no raw markers', () => {
    const blocks = parseMarkdownBlocks(
      [
        '## Summary',
        '',
        'Python is **fast** to write.',
        '- one',
        '  - two',
        '1. first',
        '> quoted',
        '```',
        'code **kept**',
        '```',
        '| A | B |',
        '|---|---|',
        '| **x** | y |',
        '---',
      ].join('\n'),
    )
    expect(blocks[0]).toEqual({ type: 'heading', level: 2, text: 'Summary' })
    expect(blocks).toContainEqual({
      type: 'paragraph',
      text: 'Python is fast to write.',
    })
    expect(blocks.filter((b) => b.type === 'item').length).toBe(3)
    expect(blocks).toContainEqual({ type: 'quote', text: 'quoted' })
    expect(blocks).toContainEqual({ type: 'code', lines: ['code **kept**'] })
    expect(blocks).toContainEqual({
      type: 'table',
      rows: [
        ['A', 'B'],
        ['x', 'y'],
      ],
    })
    expect(blocks.at(-1)).toEqual({ type: 'rule' })
  })
})
