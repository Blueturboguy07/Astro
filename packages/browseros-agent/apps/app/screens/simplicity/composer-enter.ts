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
