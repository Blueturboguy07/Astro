import { describe, expect, it } from 'bun:test'
import { agentAction } from './agent-action'

describe('agentAction (INV-SET-39)', () => {
  it('gives an installed manual-setup agent a "Manual setup" button, not Connect', () => {
    expect(
      agentAction({ installed: true, linked: false, setup: 'manual' }),
    ).toBe('manual')
  })

  it('keeps Connect, Disconnect and Get for the other rows', () => {
    expect(
      agentAction({ installed: true, linked: false, setup: 'one-click' }),
    ).toBe('connect')
    expect(agentAction({ installed: true, linked: false })).toBe('connect')
    expect(
      agentAction({ installed: true, linked: true, setup: 'manual' }),
    ).toBe('disconnect')
    expect(agentAction({ installed: false, linked: false })).toBe('get')
  })
})
