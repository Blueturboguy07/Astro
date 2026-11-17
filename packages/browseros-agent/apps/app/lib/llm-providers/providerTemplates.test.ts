import { describe, expect, it } from 'bun:test'
import { providerTemplates } from './providerTemplates'

describe('providerTemplates', () => {
  it('uses ChatGPT as the display name for new ChatGPT providers', () => {
    const template = providerTemplates.find(
      (provider) => provider.id === 'chatgpt-pro',
    )

    expect(template).toMatchObject({
      name: 'ChatGPT',
      defaultModelId: 'gpt-5.5',
      contextWindow: 1050000,
    })
  })

  /* Astro 0.2.4 QA, F-029: the setup guides pointed at docs.browseros.com. */
  it('links setup guides to the vendors, never to BrowserOS docs', () => {
    for (const t of providerTemplates) {
      expect(t.setupGuideUrl ?? '').not.toContain('browseros.com')
      expect(t.apiKeyUrl ?? '').not.toContain('browseros.com')
    }
  })
})
