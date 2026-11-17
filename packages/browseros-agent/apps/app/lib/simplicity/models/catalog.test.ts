import { describe, expect, it } from 'bun:test'
import {
  parseChosenChatModel,
  resolveBest,
  resolveChatModel,
} from './catalog'
import type { MinimalProvider } from './types'

/* F-001 (Astro 0.2.4 QA): after "Connect your plan" the answer engine
   selected "Claude Sonnet 5" (a signed-out Claude Code) instead of publik,
   and a stored automatic default looked like the person's own choice. */

const publik: MinimalProvider = {
  id: 'p1',
  type: 'openai',
  name: 'publik API',
  chatModels: [
    { key: 'publik-balanced', name: 'publik Balanced' },
    { key: 'publik-fast', name: 'publik Fast' },
    { key: 'publik-smart', name: 'publik Smart' },
  ],
  embeddingModels: [],
}
const claude: MinimalProvider = {
  id: 'c1',
  type: 'claudecode',
  name: 'Claude (your account)',
  chatModels: [
    { key: 'opus', name: 'Claude Opus' },
    { key: 'sonnet', name: 'Claude Sonnet' },
  ],
  embeddingModels: [],
}

describe('the answer engine default', () => {
  it('is publik Balanced even when a Claude Code connection is listed', () => {
    expect(resolveBest([claude, publik])).toEqual({
      providerId: 'p1',
      key: 'publik-balanced',
    })
    expect(resolveChatModel([claude, publik], null)).toEqual({
      providerId: 'p1',
      key: 'publik-balanced',
    })
  })

  it('keeps the person’s own pick while it is listed', () => {
    expect(
      resolveChatModel([claude, publik], { providerId: 'c1', key: 'sonnet' }),
    ).toEqual({ providerId: 'c1', key: 'sonnet' })
    expect(
      resolveChatModel([claude, publik], {
        providerId: 'p1',
        key: 'publik-smart',
      }),
    ).toEqual({ providerId: 'p1', key: 'publik-smart' })
  })

  it('falls back to the default when the pick is gone (signed-out CLI)', () => {
    expect(
      resolveChatModel([publik], { providerId: 'c1', key: 'sonnet' }),
    ).toEqual({ providerId: 'p1', key: 'publik-balanced' })
  })

  it('resolves a stored Best to the best listed model', () => {
    expect(resolveChatModel([claude, publik], { best: true })).toEqual({
      providerId: 'p1',
      key: 'publik-balanced',
    })
  })

  it('returns null when nothing is connected', () => {
    expect(resolveChatModel([], null)).toBeNull()
  })
})

describe('parseChosenChatModel', () => {
  it('reads what the picker writes', () => {
    expect(parseChosenChatModel('{"providerId":"p1","key":"publik-fast"}')).toEqual(
      { providerId: 'p1', key: 'publik-fast' },
    )
    expect(parseChosenChatModel('{"best":true}')).toEqual({ best: true })
  })

  it('ignores nothing, junk and the old resolved-model keys', () => {
    expect(parseChosenChatModel(null)).toBeNull()
    expect(parseChosenChatModel('not json')).toBeNull()
    expect(parseChosenChatModel('"sonnet"')).toBeNull()
  })
})
