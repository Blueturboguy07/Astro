import { describe, expect, it } from 'bun:test'
import { answerWasPaid } from './money-banner'

describe('answerWasPaid (402 banner clears)', () => {
  it('is true for an answer with text', () => {
    expect(answerWasPaid([{ type: 'text', data: 'Rome.' }])).toBe(true)
  })

  it('is false without answer text', () => {
    expect(answerWasPaid([{ type: 'research', data: {} }])).toBe(false)
    expect(answerWasPaid([{ type: 'text', data: '  ' }])).toBe(false)
  })

  it('needs one council seat that answered', () => {
    const council = (statuses: string[]) => [
      {
        type: 'council',
        data: { members: statuses.map((status) => ({ status })) },
      },
      { type: 'text', data: 'Every model in the council failed.' },
    ]
    expect(answerWasPaid(council(['error', 'error']))).toBe(false)
    expect(answerWasPaid(council(['error', 'done']))).toBe(true)
  })
})
