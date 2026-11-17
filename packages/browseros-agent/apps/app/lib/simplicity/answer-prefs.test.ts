import { describe, expect, it } from 'bun:test'
import { readOptimizationMode, readSources, saveAnswerPref } from './answer-prefs'

const memory = () => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  }
}

describe('answer prefs (F-065)', () => {
  it('keeps the speed mode and the sources', () => {
    const s = memory()
    saveAnswerPref('optimizationMode', 'quality', s)
    saveAnswerPref('answerSources', ['academic', 'discussions'], s)
    expect(readOptimizationMode(s)).toBe('quality')
    expect(readSources(s)).toEqual(['academic', 'discussions'])
  })

  it('falls back to Speed and Web for nothing or junk', () => {
    const s = memory()
    expect(readOptimizationMode(s)).toBe('speed')
    expect(readSources(s)).toEqual(['web'])
    s.setItem('optimizationMode', 'turbo')
    s.setItem('answerSources', '{bad')
    expect(readOptimizationMode(s)).toBe('speed')
    expect(readSources(s)).toEqual(['web'])
  })
})
