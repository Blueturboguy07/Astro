import type { FocusEvent, KeyboardEvent, MouseEvent } from 'react'

/* Focus selects the whole value, so typing replaces the default "1" of the
   interval field instead of appending to it ("1" then 5 gave 15; Astro 0.2.4
   QA). Chrome's mouseup after a click focus would drop the selection again:
   that one mouseup is cancelled. */
const justFocused = new WeakSet<EventTarget>()

export const selectAllOnFocus = {
  onFocus(e: FocusEvent<HTMLInputElement>) {
    e.currentTarget.select()
    justFocused.add(e.currentTarget)
  },
  onMouseUp(e: MouseEvent<HTMLInputElement>) {
    if (justFocused.delete(e.currentTarget)) e.preventDefault()
  },
  onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    justFocused.delete(e.currentTarget)
  },
  onBlur(e: FocusEvent<HTMLInputElement>) {
    justFocused.delete(e.currentTarget)
  },
}
