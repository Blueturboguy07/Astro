export const TURN_LOST_TEXT =
  "The answer stopped before it finished: the connection to Astro's local server ended. Press Retry to ask again."

/**
 * Reads an answer stream (one JSON event per line) and hands each event to
 * `onEvent`. Returns 'settled' when the stream carried a messageEnd or an
 * error, 'lost' when it ended without one: the server stopped or dropped
 * the turn, and the page must end the turn itself instead of showing
 * "Brainstorming..." with Stop for ever (Astro 0.2.4 QA, F-059, F-060).
 * A line split across two chunks is kept until it is complete; the old
 * reader re-read the whole buffer and could apply an event twice.
 */
export async function readTurnStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: { type?: string; [k: string]: unknown }) => void,
): Promise<'settled' | 'lost'> {
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let settled = false

  const handle = (line: string) => {
    if (!line.trim()) return
    let event: { type?: string }
    try {
      event = JSON.parse(line)
    } catch {
      return
    }
    if (event?.type === 'messageEnd' || event?.type === 'error') settled = true
    onEvent(event)
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl = buffer.indexOf('\n')
    while (nl >= 0) {
      handle(buffer.slice(0, nl))
      buffer = buffer.slice(nl + 1)
      nl = buffer.indexOf('\n')
    }
  }
  handle(buffer + decoder.decode())
  return settled ? 'settled' : 'lost'
}
