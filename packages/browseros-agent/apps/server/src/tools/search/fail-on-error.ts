import type { ToolSet } from 'ai'

/**
 * The search tools report a failure as `{ text, isError: true }`, which the
 * AI SDK treats as a normal result, so the side panel showed a green check
 * for a failed search (Astro 0.2.4 QA, F-047). Throwing instead makes the
 * SDK mark the call as an error (state `output-error`, a red mark) and still
 * hands the message to the model as the tool's error text.
 */
export function failOnIsError<T extends ToolSet>(tools: T): T {
  for (const item of Object.values(tools)) {
    const execute = item.execute
    if (!execute) continue
    item.execute = async (input, options) => {
      const out = await execute(input, options)
      if (
        out &&
        typeof out === 'object' &&
        (out as { isError?: unknown }).isError === true
      ) {
        const text = (out as { text?: unknown }).text
        throw new Error(
          typeof text === 'string' && text ? text : 'The tool failed.',
        )
      }
      return out
    }
  }
  return tools
}
