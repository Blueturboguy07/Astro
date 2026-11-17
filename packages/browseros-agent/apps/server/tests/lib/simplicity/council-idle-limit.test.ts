import { describe, expect, it } from 'bun:test'
import {
  MemberIdleError,
  withIdleLimit,
} from '../../../src/lib/simplicity/agents/council/idle-limit'

async function* chunks(delays: number[]) {
  for (const [i, d] of delays.entries()) {
    await new Promise((r) => setTimeout(r, d))
    yield i
  }
}

/* Astro 0.2.4 QA: a stalled council member held the chair forever. */
describe('withIdleLimit', () => {
  it('passes chunks through while they keep coming', async () => {
    const got: number[] = []
    for await (const c of withIdleLimit(chunks([5, 5, 5]), 100)) got.push(c)
    expect(got).toEqual([0, 1, 2])
  })

  it('throws MemberIdleError when a chunk takes too long', async () => {
    const got: number[] = []
    let error: unknown
    try {
      for await (const c of withIdleLimit(chunks([5, 500]), 50)) got.push(c)
    } catch (e) {
      error = e
    }
    expect(got).toEqual([0])
    expect(error).toBeInstanceOf(MemberIdleError)
  })
})
