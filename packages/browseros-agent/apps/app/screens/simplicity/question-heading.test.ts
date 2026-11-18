import { describe, expect, it } from 'bun:test'
import { enterAction, HOLD_HINT } from './composer-enter'
import { questionHeadingStyle } from './question-heading'

describe('questionHeadingStyle (F-065)', () => {
  it('a short question keeps the large heading', () => {
    expect(questionHeadingStyle('What is QUIC?')).toEqual({
      sizeClass: 'text-3xl',
      clamp: false,
    })
  })

  it('a 20,000-character question is small and cut to a few lines', () => {
    expect(questionHeadingStyle('word '.repeat(4000))).toEqual({
      sizeClass: 'text-base',
      clamp: true,
    })
  })
})

describe('enterAction (F-063 second question while streaming)', () => {
  it('holds a question typed while the answer streams and says why', () => {
    expect(enterAction(true, 'next question')).toBe('hold')
    expect(enterAction(false, 'next question')).toBe('send')
    expect(enterAction(false, '   ')).toBe('none')
    expect(HOLD_HINT).toContain('Press Enter when the answer ends')
  })
})
