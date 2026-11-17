import { describe, expect, it } from 'bun:test'
import type {
  LanguageModelV3,
  LanguageModelV3StreamPart,
} from '@ai-sdk/provider'
import { stepCountIs, streamText, tool } from 'ai'
import { z } from 'zod'
import { failOnIsError } from '../../../src/tools/search/fail-on-error'

/* Astro 0.2.4 QA, F-047: a failed web_search showed a green check. */
const failing = () =>
  failOnIsError({
    web_search: tool({
      description: 'search',
      inputSchema: z.object({ query: z.string() }),
      execute: async () => ({
        text: 'Search failed: pip install failed',
        isError: true,
      }),
    }),
    ok_tool: tool({
      description: 'ok',
      inputSchema: z.object({}),
      execute: async () => ({ text: 'fine' }),
    }),
  })

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
}

function modelCalling(toolName: string): LanguageModelV3 {
  let calls = 0
  return {
    specificationVersion: 'v3',
    provider: 'test',
    modelId: 'test',
    supportedUrls: {},
    doGenerate: async () => {
      throw new Error('not used')
    },
    doStream: async () => {
      calls++
      const parts: LanguageModelV3StreamPart[] =
        calls === 1
          ? [
              { type: 'stream-start', warnings: [] },
              {
                type: 'tool-call',
                toolCallId: 'c1',
                toolName,
                input: JSON.stringify({ query: 'bun' }),
              },
              {
                type: 'finish',
                finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
                usage,
              },
            ]
          : [
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: 't' },
              { type: 'text-delta', id: 't', delta: 'done' },
              { type: 'text-end', id: 't' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage,
              },
            ]
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const p of parts) controller.enqueue(p)
            controller.close()
          },
        }),
      }
    },
  }
}

describe('failOnIsError (F-047)', () => {
  it('throws the tool text when a tool reports isError', async () => {
    const tools = failing()
    await expect(
      tools.web_search.execute?.(
        { query: 'x' },
        { toolCallId: 'a', messages: [] },
      ),
    ).rejects.toThrow('Search failed: pip install failed')
    expect(
      await tools.ok_tool.execute?.({}, { toolCallId: 'b', messages: [] }),
    ).toEqual({ text: 'fine' })
  })

  it('the chat stream marks the failed call as an error, and the model sees the text', async () => {
    const result = streamText({
      model: modelCalling('web_search'),
      tools: failing(),
      prompt: 'find bun',
      stopWhen: stepCountIs(3),
    })
    const types: string[] = []
    let errorText = ''
    /* The server passes chatErrorText, which keeps the message. */
    for await (const chunk of result.toUIMessageStream({
      onError: (error) => (error as Error).message,
    })) {
      types.push(chunk.type)
      if (chunk.type === 'tool-output-error') errorText = chunk.errorText
    }
    expect(types).toContain('tool-output-error')
    expect(types).not.toContain('tool-output-available')
    expect(errorText).toContain('pip install failed')
    expect(types).toContain('text-delta')
  })
})
