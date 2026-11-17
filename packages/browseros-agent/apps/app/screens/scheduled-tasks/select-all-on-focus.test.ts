import { describe, expect, it, mock } from 'bun:test'
import { selectAllOnFocus } from './select-all-on-focus'

/* biome-ignore lint/suspicious/noExplicitAny: a minimal event stand-in */
const ev = (target: object, extra: object = {}): any => ({
  currentTarget: target,
  ...extra,
})

describe('selectAllOnFocus (schedule interval field)', () => {
  it('selects the value on focus and keeps it through the click', () => {
    const input = { select: mock(() => {}) }
    const preventDefault = mock(() => {})
    selectAllOnFocus.onFocus(ev(input))
    expect(input.select).toHaveBeenCalledTimes(1)
    selectAllOnFocus.onMouseUp(ev(input, { preventDefault }))
    expect(preventDefault).toHaveBeenCalledTimes(1)
    /* A later click places the caret as usual. */
    selectAllOnFocus.onMouseUp(ev(input, { preventDefault }))
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('lets a click after typing place the caret', () => {
    const input = { select: mock(() => {}) }
    const preventDefault = mock(() => {})
    selectAllOnFocus.onFocus(ev(input))
    selectAllOnFocus.onKeyDown(ev(input))
    selectAllOnFocus.onMouseUp(ev(input, { preventDefault }))
    expect(preventDefault).not.toHaveBeenCalled()
  })
})
