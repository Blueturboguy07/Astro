import { beforeAll, describe, expect, it, mock } from 'bun:test'
import { createElement, type FC, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// The three sibling sections are stubbed so this exercises the page's own
// composition.
mock.module('./MCPServerHeader', () => ({
  MCPServerHeader: () => createElement('div', null, 'server-header'),
}))

mock.module('./IntegrationsSection', () => ({
  IntegrationsSection: () => createElement('div', null, 'integrations'),
}))

mock.module('./MCPToolsSection', () => ({
  MCPToolsSection: () => createElement('div', null, 'tools'),
}))

mock.module('@/components/ui/button', () => ({
  Button: ({ children }: { children?: ReactNode }) =>
    createElement('button', { type: 'button' }, children),
}))

mock.module('@/lib/metrics/track', () => ({
  track: () => {},
}))

mock.module('@/lib/sentry/sentry', () => ({
  sentry: { captureException: () => {} },
}))

mock.module('@/lib/browseros/helpers', () => ({
  getMcpServerUrl: async () => 'http://127.0.0.1:9200/mcp',
}))

mock.module('@/lib/messaging/server/serverMessages', () => ({
  sendServerMessage: async () => ({ tools: [] }),
}))

let MCPSettingsPage: FC

beforeAll(async () => {
  MCPSettingsPage = (await import('./MCPSettingsPage')).MCPSettingsPage
})

describe('MCPSettingsPage', () => {
  /* Astro 0.2.4 QA, F-027: no BrowserClaw advert on Astro's MCP page. */
  it('shows the server header and integrations, without a BrowserClaw advert', () => {
    const html = renderToStaticMarkup(createElement(MCPSettingsPage))

    expect(html).not.toContain('BrowserClaw')
    expect(html.indexOf('server-header')).toBeGreaterThan(-1)
    expect(html.indexOf('integrations')).toBeGreaterThan(-1)
  })
})
