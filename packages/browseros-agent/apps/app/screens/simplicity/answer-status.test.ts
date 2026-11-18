import { describe, expect, it } from 'bun:test'
import { isPartialStoppedAnswer, stepsHeaderLabel } from './answer-status'

describe('stepsHeaderLabel (F-089)', () => {
  it('says Stopped, not Completed, for a stopped answer', () => {
    expect(stepsHeaderLabel('cancelled', false, 3)).toBe('Stopped · 3 steps')
    expect(stepsHeaderLabel('completed', false, 1)).toBe('Completed · 1 step')
    expect(stepsHeaderLabel('error', false, 2)).toBe('Failed · 2 steps')
    expect(stepsHeaderLabel('answering', true, 2)).toBe(
      'Working · 2 steps completed',
    )
  })
})

describe('isPartialStoppedAnswer (F-089)', () => {
  it('marks a stopped answer that has text', () => {
    expect(
      isPartialStoppedAnswer('cancelled', [{ type: 'text', data: 'Half an' }]),
    ).toBe(true)
  })
  it('leaves other answers alone', () => {
    expect(isPartialStoppedAnswer('cancelled', [])).toBe(false)
    expect(
      isPartialStoppedAnswer('completed', [{ type: 'text', data: 'Done' }]),
    ).toBe(false)
    expect(
      isPartialStoppedAnswer('cancelled', [
        { type: 'text', data: 'x' },
        { type: 'error', data: 'boom' },
      ]),
    ).toBe(false)
  })
})
