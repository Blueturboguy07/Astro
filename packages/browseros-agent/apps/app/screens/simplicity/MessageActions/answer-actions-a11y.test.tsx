import { describe, expect, it } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Copy from './Copy'
import Rewrite from './Rewrite'

/* Astro 0.2.4 QA: the icon buttons under an answer had no accessible name. */
describe('answer action buttons', () => {
  it('Rewrite and Copy have accessible names', () => {
    const rewrite = renderToStaticMarkup(
      createElement(Rewrite, { rewrite: () => {}, messageId: 'm' }),
    )
    expect(rewrite).toContain('aria-label="Rewrite answer"')
    const copy = renderToStaticMarkup(
      createElement(Copy, {
        initialMessage: 'x',
        // biome-ignore lint/suspicious/noExplicitAny: only responseBlocks is read on click
        section: { message: { responseBlocks: [] } } as any,
      }),
    )
    expect(copy).toContain('aria-label="Copy answer"')
  })
})
