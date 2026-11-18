import { describe, expect, it } from 'bun:test'
import { readComposerDraft, writeComposerDraft } from './composer-draft'

function fakeStore() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    size: () => m.size,
  }
}

describe('composer draft (SIDEPANEL-INPUT-CLEARS)', () => {
  it('a re-mounted composer reads back the half-typed text', () => {
    const store = fakeStore()
    writeComposerDraft('compare the three cheapest fli', store)
    expect(readComposerDraft(store)).toBe('compare the three cheapest fli')
  })

  it('sending (empty text) clears the draft', () => {
    const store = fakeStore()
    writeComposerDraft('hello', store)
    writeComposerDraft('', store)
    expect(readComposerDraft(store)).toBe('')
    expect(store.size()).toBe(0)
  })

  it('a blocked storage still keeps the draft for this page', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    writeComposerDraft('kept in memory', blocked)
    expect(readComposerDraft(blocked)).toBe('kept in memory')
    expect(readComposerDraft(null)).toBe('kept in memory')
    writeComposerDraft('', null)
  })
})
