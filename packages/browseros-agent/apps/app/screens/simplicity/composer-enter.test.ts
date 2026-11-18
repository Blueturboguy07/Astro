import { describe, expect, it } from 'bun:test'
import { enterAction, stopClick } from './composer-enter'

describe('composer: held question (F-063, INV-ENGINE-31)', () => {
  it('Enter holds the question while the answer streams', () => {
    expect(enterAction(true, 'What about wind power?')).toBe('hold')
    expect(enterAction(false, 'What about wind power?')).toBe('send')
    expect(enterAction(true, '   ')).toBe('none')
  })

  it('Stop cancels the click default action before it ends the turn', () => {
    const calls: string[] = []
    stopClick(
      { preventDefault: () => calls.push('preventDefault') },
      () => calls.push('stop'),
    )
    /* Without preventDefault the re-rendered submit button sent the held
       question under the same click. */
    expect(calls).toEqual(['preventDefault', 'stop'])
  })
})
