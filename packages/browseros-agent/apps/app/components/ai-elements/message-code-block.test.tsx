import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Streamdown } from 'streamdown'
import { CODE_BLOCK_ALWAYS_RENDERED } from './code-block-style'

/* Astro 0.2.4 QA, UC-32 (Windows): the csv block of one fixed stub answer
   was empty in one run and full in another. Streamdown sets
   content-visibility: auto on code blocks; Chrome then gives no innerText
   for a block outside the viewport (seen on 0.0.114: textContent 73 chars,
   innerText 0). */
describe('MessageResponse code blocks (UC-32)', () => {
  const answer =
    'Here are the rows:\n\n```csv\nCountry,Population\nIndia,1417492000\n```\n\nDone.'

  it('renders the full csv text and opts the block out of content-visibility', () => {
    const html = renderToStaticMarkup(
      <Streamdown className={CODE_BLOCK_ALWAYS_RENDERED}>{answer}</Streamdown>,
    )
    expect(html).toContain('data-streamdown="code-block"')
    expect(html).toContain('India,1417492000')
    expect(html).toContain(
      CODE_BLOCK_ALWAYS_RENDERED.replace(/&/g, '&amp;').replace(/"/g, '&quot;'),
    )
  })

  it('the override is an important content-visibility: visible rule', () => {
    expect(CODE_BLOCK_ALWAYS_RENDERED).toBe(
      '[&_[data-streamdown="code-block"]]:[content-visibility:visible]!',
    )
  })
})
