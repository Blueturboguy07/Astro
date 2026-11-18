import { describe, expect, it } from 'bun:test'
import { resultPreview } from './result-preview'

describe('resultPreview (F-089: raw markdown in scheduled Results)', () => {
  it('shows the words, not the markdown marks', () => {
    const md = [
      '## Top 5 Hacker News stories',
      '',
      '1. **Show HN: A tiny database** — [link](https://news.ycombinator.com/item?id=1)',
      '2. *Rust 2.0* released ([source](https://example.com))',
      '- `npm` audit tips',
      '> quoted line',
    ].join('\n')
    expect(resultPreview(md)).toBe(
      'Top 5 Hacker News stories Show HN: A tiny database — link Rust 2.0 released (source) npm audit tips quoted line',
    )
  })

  it('drops tables and code blocks to plain words', () => {
    const md =
      '| City | Pop |\n|---|---|\n| Paris | 2.1M |\n```js\nconsole.log(1)\n```\nDone.'
    expect(resultPreview(md)).toBe('City Pop Paris 2.1M Done.')
  })

  it('keeps plain text and snake_case words as they are', () => {
    expect(resultPreview('The run used file_name and 3 * 4 = 12.')).toBe(
      'The run used file_name and 3 * 4 = 12.',
    )
  })
})
