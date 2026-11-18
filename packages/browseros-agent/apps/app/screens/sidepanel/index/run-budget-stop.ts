import type { UIMessage } from 'ai'

/* The server starts its report with this line when a turn reaches the run
   budget (apps/server/src/agent/run-budget.ts, Astro 0.2.4 QA F-072). The
   line is a text part of its own. */
const STOP_LINE =
  /^\*\*Stopped( after \d+ actions?|: no progress for \d+ minutes?)\.\*\*/

/** The message the Continue button sends; the next turn has a new budget. */
export const CONTINUE_MESSAGE = 'Continue'

export function isRunBudgetStop(message: UIMessage): boolean {
  if (message.role !== 'assistant') return false
  return message.parts.some(
    (part) => part.type === 'text' && STOP_LINE.test(part.text),
  )
}
