import { describe, expect, it } from 'bun:test'
import type { UIMessage } from 'ai'
import { CONTINUE_MESSAGE, isRunBudgetStop } from './run-budget-stop'

/* Astro 0.2.4 QA, F-072: a turn stopped by the run budget shows a Continue
   button. The texts are the ones the server writes (run-budget.ts). */

function assistant(...texts: string[]): UIMessage {
  return {
    id: 'a1',
    role: 'assistant',
    parts: texts.map((text) => ({ type: 'text' as const, text })),
  }
}

describe('isRunBudgetStop', () => {
  it('finds the server stop line in its own text part', () => {
    expect(
      isRunBudgetStop(
        assistant(
          '**Stopped after 40 actions.** The site returned an error (HTTP 500 at https://automationintesting.online/api/room/1).\n\n',
          'I set the dates; the booking page never loaded.',
          '\n\nReply **Continue** to resume from here.',
        ),
      ),
    ).toBe(true)
    expect(
      isRunBudgetStop(assistant('**Stopped: no progress for 3 minutes.**\n\n')),
    ).toBe(true)
    expect(isRunBudgetStop(assistant('**Stopped after 1 action.**'))).toBe(true)
  })

  it('ignores normal answers and user messages', () => {
    expect(isRunBudgetStop(assistant('Here is your table.'))).toBe(false)
    expect(
      isRunBudgetStop(assistant('The task: **Stopped after 40 actions.**')),
    ).toBe(false)
    expect(
      isRunBudgetStop({
        ...assistant('**Stopped after 40 actions.**'),
        role: 'user',
      }),
    ).toBe(false)
  })

  it('sends the word the server prompt tells the user to reply', () => {
    expect(CONTINUE_MESSAGE).toBe('Continue')
  })
})
