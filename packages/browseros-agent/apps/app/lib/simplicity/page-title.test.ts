import { describe, expect, it } from 'bun:test'
import { pageTitle } from './page-title'

describe('pageTitle', () => {
  it('names the open chat by its first question', () => {
    expect(pageTitle('What is the capital of Australia and why?')).toBe(
      'What is the capital of Austral - Astro',
    )
  })

  it('is plain Astro for an empty home (after New)', () => {
    expect(pageTitle()).toBe('Astro')
    expect(pageTitle('   ')).toBe('Astro')
  })
})
