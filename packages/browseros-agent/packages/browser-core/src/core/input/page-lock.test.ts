import { describe, expect, it } from 'bun:test'
import { withPageLock } from './input'

/* F-075 (Astro 0.2.4 QA): parallel fills on one page mixed their text. */
describe('withPageLock', () => {
  it('runs keyboard work on one page one after another', async () => {
    const log: string[] = []
    const work = (name: string, ms: number) => async () => {
      log.push(`${name} start`)
      await new Promise((r) => setTimeout(r, ms))
      log.push(`${name} end`)
    }
    await Promise.all([
      withPageLock(1, work('a', 30)),
      withPageLock(1, work('b', 5)),
    ])
    expect(log).toEqual(['a start', 'a end', 'b start', 'b end'])
  })

  it('lets different pages run at once, and a failure does not block', async () => {
    const log: string[] = []
    await Promise.all([
      withPageLock(2, async () => {
        await new Promise((r) => setTimeout(r, 20))
        log.push('page 2')
      }),
      withPageLock(3, async () => {
        log.push('page 3')
      }),
    ])
    expect(log).toEqual(['page 3', 'page 2'])
    await expect(
      withPageLock(4, async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(await withPageLock(4, async () => 'next')).toBe('next')
  })
})
