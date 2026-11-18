import { describe, expect, it } from 'bun:test'
import { stopGlowOnTabs } from './confetti-once'

describe('stopGlowOnTabs (INV-PANEL-21)', () => {
  it('keeps the flag unset when no tab can show the confetti', async () => {
    const asked: Array<[number, boolean]> = []
    const shown = await stopGlowOnTabs([7], false, async (id, c) => {
      asked.push([id, c])
      throw new Error(
        'Could not establish connection. Receiving end does not exist.',
      )
    })
    expect(shown).toBe(false)
    expect(asked).toEqual([[7, true]])
  })

  it('asks the next tab when the first one did not show it', async () => {
    const asked: Array<[number, boolean]> = []
    const shown = await stopGlowOnTabs([1, 2, 3], false, async (id, c) => {
      asked.push([id, c])
      return { success: true, confetti: c && id === 2 }
    })
    expect(shown).toBe(true)
    expect(asked).toEqual([
      [1, true],
      [2, true],
      [3, false],
    ])
  })

  it('never asks again once the confetti was shown before', async () => {
    const asked: boolean[] = []
    const shown = await stopGlowOnTabs([1, 2], true, async (_id, c) => {
      asked.push(c)
      return { success: true, confetti: false }
    })
    expect(shown).toBe(false)
    expect(asked).toEqual([false, false])
  })
})
