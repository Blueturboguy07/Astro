import { describe, expect, it } from 'bun:test'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { jsonSchema, streamText, tool } from 'ai'
import {
  nativeStreamToOpenAISSE,
  ollamaNativeFetch,
  toNativeChatBody,
} from '../../src/agent/ollama-native-fetch'

/* Astro 0.2.4 QA, F-035: Ollama's /v1 ignores num_ctx, so the 9k-token
   agent prompt was cut to 2048 tokens and answers came back empty. */
describe('toNativeChatBody', () => {
  it('sets num_ctx and maps tools, tool results and images', () => {
    const native = toNativeChatBody(
      {
        model: 'qwen2.5:3b',
        stream: true,
        temperature: 0.2,
        max_tokens: 50,
        tools: [
          { type: 'function', function: { name: 'open', parameters: {} } },
        ],
        messages: [
          { role: 'system', content: 'sys' },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'look' },
              {
                type: 'image_url',
                image_url: { url: 'data:image/png;base64,AAA' },
              },
            ],
          },
          {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'c1',
                type: 'function',
                function: { name: 'open', arguments: '{"url":"x"}' },
              },
            ],
          },
          { role: 'tool', tool_call_id: 'c1', content: 'done' },
        ],
      },
      32000,
    ) as {
      options: Record<string, unknown>
      messages: Record<string, unknown>[]
    }
    expect(native.options).toMatchObject({
      num_ctx: 32000,
      temperature: 0.2,
      num_predict: 50,
    })
    expect(native.messages[1]).toMatchObject({
      content: 'look',
      images: ['AAA'],
    })
    expect(native.messages[2]).toMatchObject({
      tool_calls: [{ function: { name: 'open', arguments: { url: 'x' } } }],
    })
    expect(native.messages[3]).toMatchObject({
      role: 'tool',
      tool_name: 'open',
      content: 'done',
    })
  })
})

function ndjson(lines: unknown[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(c) {
      for (const l of lines) c.enqueue(enc.encode(`${JSON.stringify(l)}\n`))
      c.close()
    },
  })
}

describe('ollamaNativeFetch with the AI SDK', () => {
  it('streams text, a tool call and usage through @ai-sdk/openai-compatible', async () => {
    let sentTo = ''
    let sentBody: Record<string, unknown> = {}
    const fake = (async (url: string, init: RequestInit) => {
      sentTo = url
      sentBody = JSON.parse(String(init.body))
      return new Response(
        ndjson([
          { message: { content: 'Hel' }, done: false },
          { message: { content: 'lo' }, done: false },
          {
            message: {
              content: '',
              tool_calls: [{ function: { name: 'ping', arguments: { n: 1 } } }],
            },
            done: false,
          },
          {
            message: { content: '' },
            done: true,
            done_reason: 'stop',
            prompt_eval_count: 9100,
            eval_count: 7,
          },
        ]),
        { status: 200 },
      )
    }) as unknown as typeof fetch
    const provider = createOpenAICompatible({
      name: 'ollama',
      baseURL: 'http://127.0.0.1:11434/v1',
      fetch: ollamaNativeFetch('http://127.0.0.1:11434/v1', {
        fetchImpl: fake,
      }),
    })
    const result = streamText({
      model: provider('qwen2.5:3b'),
      prompt: 'hi',
      tools: {
        ping: tool({
          inputSchema: jsonSchema<{ n: number }>({
            type: 'object',
            properties: { n: { type: 'number' } },
          }),
        }),
      },
    })
    const text = await result.text
    const calls = await result.toolCalls
    const usage = await result.usage
    expect(sentTo).toBe('http://127.0.0.1:11434/api/chat')
    expect((sentBody.options as { num_ctx: number }).num_ctx).toBe(32000)
    expect(text).toBe('Hello')
    expect(calls[0]).toMatchObject({ toolName: 'ping', input: { n: 1 } })
    expect(usage.inputTokens).toBe(9100)
    expect(await result.finishReason).toBe('tool-calls')
  })

  it('passes an Ollama error on with its status', async () => {
    const fake = (async () =>
      new Response(JSON.stringify({ error: 'model "x" not found' }), {
        status: 404,
      })) as unknown as typeof fetch
    const f = ollamaNativeFetch('http://h:11434/v1', { fetchImpl: fake })
    const res = await f('http://h:11434/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'x', messages: [] }),
    })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      error: { message: 'model "x" not found' },
    })
  })

  it('leaves other requests alone', async () => {
    let hit = ''
    const fake = (async (u: string) => {
      hit = u
      return new Response('{}')
    }) as unknown as typeof fetch
    await ollamaNativeFetch('http://h:11434/v1', { fetchImpl: fake })(
      'http://h:11434/v1/models',
    )
    expect(hit).toBe('http://h:11434/v1/models')
  })
})

describe('nativeStreamToOpenAISSE', () => {
  it('ends with a finish chunk and [DONE] even without a done line', async () => {
    const out = await new Response(
      nativeStreamToOpenAISSE(
        ndjson([{ message: { content: 'x' }, done: false }]),
        'm',
      ),
    ).text()
    expect(out).toContain('"finish_reason":"stop"')
    expect(out.trimEnd().endsWith('data: [DONE]')).toBe(true)
  })
})
