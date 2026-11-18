import { describe, expect, it } from 'bun:test'
import { hubProviderUrl } from './hub-provider-url'

describe('hubProviderUrl (F-091 e)', () => {
  it('refuses text that is not a web address', () => {
    for (const bad of [
      'not a url',
      'https://not a url',
      'chatgpt',
      'ftp://x.com',
      '',
      '   ',
      'https://',
      'https://exa mple.com',
    ]) {
      expect(hubProviderUrl(bad)).toBeNull()
    }
  })

  it('keeps real addresses and adds https://', () => {
    expect(hubProviderUrl('chatgpt.com')).toBe('https://chatgpt.com')
    expect(hubProviderUrl('https://claude.ai/')).toBe('https://claude.ai')
    expect(hubProviderUrl('http://localhost:3000/chat')).toBe(
      'http://localhost:3000/chat',
    )
    expect(hubProviderUrl('127.0.0.1:8080')).toBe('https://127.0.0.1:8080')
    expect(hubProviderUrl('https://chat.mistral.ai/chat?x=1')).toBe(
      'https://chat.mistral.ai/chat?x=1',
    )
  })
})
