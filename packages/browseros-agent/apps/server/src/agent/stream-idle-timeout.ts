import type {
  LanguageModelV3Middleware,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
} from '@ai-sdk/provider'
import { TIMEOUTS } from '@browseros/shared/constants/timeouts'

const NO_USAGE = {
  inputTokens: {
    total: undefined,
    noCache: undefined,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
}

export class ModelStreamIdleError extends Error {
  readonly idleMs: number

  constructor(idleMs: number) {
    super(
      `The AI model stopped answering: no data for ${Math.round(idleMs / 1000)} seconds. Retry, or choose another model.`,
    )
    this.name = 'ModelStreamIdleError'
    this.idleMs = idleMs
  }
}

/**
 * Stops a model stream that sends nothing for `idleMs`; a stalled stream
 * left the side panel on a spinner forever (Astro 0.2.4 QA, F-045). The
 * wait for the response and every wait for the next event count, but not
 * the time a tool runs: the clock runs only while a read is pending. The upstream request is
 * aborted and the stream ends with a ModelStreamIdleError part, whose
 * message the chat shows with Retry.
 */
export function streamIdleTimeoutMiddleware(
  idleMs: number = TIMEOUTS.MODEL_STREAM_IDLE,
): LanguageModelV3Middleware {
  return {
    specificationVersion: 'v3',
    wrapStream: async ({ params, model }) => {
      const stop = new AbortController()
      const abortSignal = params.abortSignal
        ? AbortSignal.any([params.abortSignal, stop.signal])
        : stop.signal

      const result = await withIdleLimit(
        Promise.resolve(model.doStream({ ...params, abortSignal })),
        idleMs,
        () => stop.abort(new ModelStreamIdleError(idleMs)),
      )

      const reader = result.stream.getReader()
      let timer: ReturnType<typeof setTimeout> | undefined
      let idled = false
      const stream = new ReadableStream<LanguageModelV3StreamPart>({
        async pull(controller) {
          timer = setTimeout(() => {
            idled = true
            stop.abort(new ModelStreamIdleError(idleMs))
            reader.cancel().catch(() => {})
            /* An error part plus a finish part, not controller.error(): a
               failed ReadableStream escapes the AI SDK's onError, and a
               stream without a finish part adds a second "No output
               generated" error that would replace this message. */
            controller.enqueue({
              type: 'error',
              error: new ModelStreamIdleError(idleMs),
            })
            controller.enqueue({
              type: 'finish',
              finishReason: { unified: 'error', raw: 'idle-timeout' },
              usage: NO_USAGE,
            })
            controller.close()
          }, idleMs)
          try {
            const { done, value } = await reader.read()
            clearTimeout(timer)
            if (idled) return
            if (done) controller.close()
            else controller.enqueue(value)
          } catch (error) {
            clearTimeout(timer)
            if (idled) return
            controller.error(error)
          }
        },
        cancel(reason) {
          clearTimeout(timer)
          return reader.cancel(reason)
        },
      })
      return { ...result, stream } satisfies LanguageModelV3StreamResult
    },
  }
}

function withIdleLimit<T>(
  pending: Promise<T>,
  idleMs: number,
  onIdle: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onIdle()
      reject(new ModelStreamIdleError(idleMs))
    }, idleMs)
    pending.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}
