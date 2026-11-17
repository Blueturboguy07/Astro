import { describe, expect, it } from 'bun:test'
import type { UIMessage } from 'ai'
import { getMessageSegments, shownToolState } from './getMessageSegments'

describe('shownToolState', () => {
  it('shows a result that carries isError as failed', () => {
    expect(
      shownToolState('output-available', {
        content: [
          { type: 'text', text: 'Unknown ref e29; take a new snapshot.' },
        ],
        isError: true,
      }),
    ).toBe('output-error')
    expect(shownToolState('result', { isError: true })).toBe('output-error')
  })

  it('keeps a good result and every other state', () => {
    expect(
      shownToolState('output-available', { content: [], isError: false }),
    ).toBe('output-available')
    expect(shownToolState('output-available', ['x'])).toBe('output-available')
    expect(shownToolState('input-available', { isError: true })).toBe(
      'input-available',
    )
    expect(shownToolState('output-error', undefined)).toBe('output-error')
  })
})

describe('getMessageSegments tool batch', () => {
  it('counts a refused upload as failed, not completed', () => {
    const message = {
      id: 'm1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-upload',
          toolCallId: 'c1',
          state: 'output-available',
          input: {},
          output: {
            content: [{ type: 'text', text: 'File not found' }],
            isError: true,
          },
        },
        {
          type: 'tool-snapshot',
          toolCallId: 'c2',
          state: 'output-available',
          input: {},
          output: { content: [{ type: 'text', text: 'ok' }], isError: false },
        },
      ],
    } as unknown as UIMessage
    const [batch] = getMessageSegments(message, true, false)
    expect(batch?.type).toBe('tool-batch')
    const states =
      batch?.type === 'tool-batch' ? batch.tools.map((t) => t.state) : []
    expect(states).toEqual(['output-error', 'output-available'])
  })
})
