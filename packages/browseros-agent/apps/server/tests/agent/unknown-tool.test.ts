import { describe, expect, it } from 'bun:test'
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3Usage,
} from '@ai-sdk/provider'
import { generateText, stepCountIs, tool } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import { z } from 'zod'

/* Astro 0.2.4 QA, F-070 (UC-32): the model called "browser_read", a tool
   that does not exist. The AI SDK answers with a tool error that the model
   sees on its next step; the side panel turns the same text into a visible
   line (getMessageSegments.ts toolErrorText matches this wording). */

const usage: LanguageModelV3Usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 5, reasoning: undefined },
}

describe('unknown tool call', () => {
  it('becomes a clear tool error that the model reads on the next step', async () => {
    const calls: LanguageModelV3CallOptions[] = []
    const model = new MockLanguageModelV3({
      doGenerate: async (options): Promise<LanguageModelV3GenerateResult> => {
        calls.push(options)
        if (calls.length === 1) {
          return {
            content: [
              {
                type: 'tool-call',
                toolCallId: 'c1',
                toolName: 'browser_read',
                input: '{"page":1}',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
            usage,
          }
        }
        return {
          content: [{ type: 'text', text: 'Used read instead.' }],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
        }
      },
    })
    const result = await generateText({
      model,
      prompt: 'Top 10 rows as CSV',
      tools: {
        read: tool({
          inputSchema: z.object({ page: z.number() }),
          execute: async () => ({ content: [], isError: false }),
        }),
      },
      stopWhen: stepCountIs(5),
    })

    const error = result.steps[0]?.content.find((p) => p.type === 'tool-error')
    expect(error?.type).toBe('tool-error')
    const message =
      error?.type === 'tool-error'
        ? String((error.error as { message?: unknown })?.message ?? error.error)
        : ''
    expect(message).toStartWith(
      "Model tried to call unavailable tool 'browser_read'. Available tools: read.",
    )
    const toolMessage = calls[1]?.prompt.find((m) => m.role === 'tool')
    expect(JSON.stringify(toolMessage)).toContain(
      "unavailable tool 'browser_read'",
    )
    expect(result.text).toBe('Used read instead.')
  })
})
