import { describe, expect, it } from 'bun:test'
import { CHROME_PAGE_REDIRECTS } from './chrome-page-redirects'

describe('chrome://browseros page redirects (F-080)', () => {
  it('sends chrome://browseros/mcp to the MCP settings page', () => {
    expect(CHROME_PAGE_REDIRECTS['/mcp']).toBe('/settings/mcp')
  })

  it('every target is a settings or top-level route, never home', () => {
    for (const to of Object.values(CHROME_PAGE_REDIRECTS)) {
      expect(to.startsWith('/')).toBe(true)
      expect(to).not.toBe('/home')
    }
  })
})
