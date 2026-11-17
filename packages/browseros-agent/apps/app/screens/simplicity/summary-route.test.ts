import { describe, expect, it } from 'bun:test'
import { summaryRoute } from './summary-route'

describe('summaryRoute', () => {
  it('is a hash-router route on the home page with the query encoded', () => {
    expect(summaryRoute('https://example.com/a?b=1&c=2')).toBe(
      '/home?q=Summary%3A%20https%3A%2F%2Fexample.com%2Fa%3Fb%3D1%26c%3D2',
    )
    expect(
      new URLSearchParams(summaryRoute('https://x.y/z?k=v').split('?')[1]).get(
        'q',
      ),
    ).toBe('Summary: https://x.y/z?k=v')
  })
})
