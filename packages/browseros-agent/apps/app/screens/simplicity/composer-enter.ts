/* Enter in the follow-up box. While an answer streams, a second question
   is held in the box: it is not sent, and it was not said why (Astro 0.2.4
   QA, F-063 "second question while streaming"). */
export type EnterAction = 'send' | 'hold' | 'none'

export const enterAction = (loading: boolean, message: string): EnterAction => {
  if (!message.trim()) return 'none'
  return loading ? 'hold' : 'send'
}

export const HOLD_HINT =
  'The answer is not finished. Your question stays here. Press Enter when the answer ends, or press Stop first.'

/* Stop with a question held in the box. The click handler ends the turn,
   React re-renders the same <button> as the Send (submit) button before
   the browser runs the click's default action, and the browser then
   submitted the form: Stop sent the held question (Astro 0.2.4 QA,
   INV-ENGINE-31 note). The default action is cancelled; the two buttons
   also get their own keys, so the clicked node is never reused as Send. */
export const stopClick = (
  e: { preventDefault: () => void },
  onStop: () => void,
): void => {
  e.preventDefault()
  onStop()
}
