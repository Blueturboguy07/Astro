import { describe, expect, it } from 'bun:test'
import type {
  LanguageModelV3,
  LanguageModelV3StreamPart,
} from '@ai-sdk/provider'
import { streamText, wrapLanguageModel } from 'ai'
import {
  ModelStreamIdleError,
  streamIdleTimeoutMiddleware,
} from '../../src/agent/stream-idle-timeout'

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
}

function fakeModel(
  stream: (
    signal: AbortSignal | undefined,
  ) => ReadableStream<LanguageModelV3StreamPart>,
  seen: { signal?: AbortSignal } = {},
  responseDelayMs = 0,
): LanguageModelV3 {
  return {
    specificationVersion: 'v3',
    provider: 'test',
    modelId: 'test',
    supportedUrls: {},
    doGenerate: async () => {
      throw new Error('not used')
    },
    doStream: async (options) => {
      seen.signal = options.abortSignal
      if (responseDelayMs === Infinity) return new Promise(() => {})
      if (responseDelayMs > 0) await Bun.sleep(responseDelayMs)
      return { stream: stream(options.abortSignal) }
    },
  }
}

function textParts(): LanguageModelV3StreamPart[] {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', delta: 'he' },
  ]
}

async function drain(stream: ReadableStream<LanguageModelV3StreamPart>) {
  const parts: LanguageModelV3StreamPart[] = []
  const reader = stream.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return { parts }
      parts.push(value)
    }
  } catch (error) {
    return { parts, error }
  }
}

async function callStream(model: LanguageModelV3) {
  const wrapped = wrapLanguageModel({
    model,
    middleware: streamIdleTimeoutMiddleware(60),
  })
  return wrapped.doStream({ prompt: [] })
}

describe('stream idle timeout (F-045)', () => {
  it('fails a stream that stalls after some events and aborts the request', async () => {
    const seen: { signal?: AbortSignal } = {}
    const model = fakeModel(
      () =>
        new ReadableStream({
          start(controller) {
            for (const part of textParts()) controller.enqueue(part)
            // then nothing: no finish, no close
          },
        }),
      seen,
    )
    const { stream } = await callStream(model)
    const { parts, error } = await drain(stream)
    expect(error).toBeUndefined()
    expect(parts.map((p) => p.type)).toEqual([
      'stream-start',
      'text-start',
      'text-delta',
      'error',
      'finish',
    ])
    const idle = parts[3] as { type: 'error'; error: unknown }
    expect(idle.error).toBeInstanceOf(ModelStreamIdleError)
    expect(seen.signal?.aborted).toBe(true)
  })

  it('fails when the response never starts', async () => {
    const model = fakeModel(() => new ReadableStream(), {}, Infinity)
    await expect(callStream(model)).rejects.toBeInstanceOf(ModelStreamIdleError)
  })

  it('lets a slow but steady stream finish', async () => {
    const model = fakeModel(
      () =>
        new ReadableStream({
          async start(controller) {
            for (const part of textParts()) {
              controller.enqueue(part)
              await Bun.sleep(30)
            }
            controller.enqueue({ type: 'text-end', id: 't' })
            await Bun.sleep(30)
            controller.enqueue({
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage,
            })
            controller.close()
          },
        }),
    )
    const { stream } = await callStream(model)
    const { parts, error } = await drain(stream)
    expect(error).toBeUndefined()
    expect(parts.at(-1)?.type).toBe('finish')
  })

  it('does not count time while nobody reads the stream', async () => {
    const model = fakeModel(
      () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] })
            controller.close()
          },
        }),
    )
    const { stream } = await callStream(model)
    await Bun.sleep(150)
    const { error } = await drain(stream)
    expect(error).toBeUndefined()
  })

  it('reaches the chat UI stream as an error chunk with a clear message', async () => {
    const model = wrapLanguageModel({
      model: fakeModel(
        () =>
          new ReadableStream({
            start(controller) {
              for (const part of textParts()) controller.enqueue(part)
            },
          }),
      ),
      middleware: streamIdleTimeoutMiddleware(60),
    })
    const result = streamText({ model, prompt: 'hi', onError: () => {} })
    const chunks: { type: string; errorText?: string }[] = []
    for await (const chunk of result.toUIMessageStream({
      onError: (error) => (error as Error).message,
    })) {
      chunks.push(chunk as { type: string; errorText?: string })
    }
    const errors = chunks.filter((c) => c.type === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0]?.errorText).toContain('stopped answering')
  })
})
