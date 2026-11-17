import { TIMEOUTS } from '@browseros/shared/constants/timeouts';
import type BaseLLM from './base/llm';

/**
 * Time limits for answer-engine model calls. A publik stream that stopped
 * sending (no chunk, no end) kept the turn on "Brainstorming..." with the
 * Stop button for ever, and the row stayed "answering" (Astro 0.2.4 QA,
 * F-059: 9 of about 22 publik turns). A call that goes over its limit now
 * throws, and the chat route ends the turn with the error and a Retry.
 */
export class ModelTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelTimeoutError';
  }
}

const seconds = (ms: number) => Math.round(ms / 1000);

export const idleError = (ms: number) =>
  new ModelTimeoutError(
    `The model stopped sending its answer (nothing for ${seconds(ms)} seconds). Press Retry, or pick another model.`,
  );

export const callError = (ms: number) =>
  new ModelTimeoutError(
    `The model did not answer in ${seconds(ms)} seconds. Press Retry, or pick another model.`,
  );

/**
 * Yields from `source`. Throws `makeError(limit)` when the first chunk takes
 * longer than `firstMs` or a later one longer than `idleMs`. Ends quietly
 * when `signal` aborts (Stop), also while a chunk is pending.
 */
export async function* withIdleLimit<T>(
  source: AsyncGenerator<T> | AsyncIterable<T>,
  opts: {
    idleMs?: number;
    firstMs?: number;
    signal?: AbortSignal;
    makeError?: (ms: number) => Error;
  } = {},
): AsyncGenerator<T> {
  const idleMs = opts.idleMs ?? TIMEOUTS.MODEL_STREAM_IDLE;
  const firstMs = opts.firstMs ?? idleMs;
  const makeError = opts.makeError ?? idleError;
  const it = source[Symbol.asyncIterator]();
  let first = true;
  try {
    while (true) {
      if (opts.signal?.aborted) return;
      const limit = first ? firstMs : idleMs;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let onAbort: (() => void) | undefined;
      const stop = new Promise<'aborted'>((resolve, reject) => {
        /* setTimeout turns Infinity into 1 ms. */
        if (Number.isFinite(limit)) {
          timer = setTimeout(() => reject(makeError(limit)), limit);
        }
        onAbort = () => resolve('aborted');
        opts.signal?.addEventListener('abort', onAbort, { once: true });
      });
      let step: IteratorResult<T> | 'aborted';
      try {
        step = await Promise.race([it.next(), stop]);
      } finally {
        clearTimeout(timer);
        if (onAbort) opts.signal?.removeEventListener('abort', onAbort);
      }
      if (step === 'aborted' || step.done) return;
      first = false;
      yield step.value;
    }
  } finally {
    /* Do not wait: a stalled source may never settle its return(). */
    void Promise.resolve(it.return?.(undefined)).catch(() => {});
  }
}

/** Rejects with `makeError(ms)` when `work` takes longer than `ms`. */
export function withCallLimit<T>(
  work: Promise<T>,
  ms: number = TIMEOUTS.MODEL_CALL,
  makeError: (ms: number) => Error = callError,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(makeError(ms)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/**
 * Puts the limits on every call of one loaded model. Patches the instance
 * (not a wrapper object) so setMeter and the provider's own fields still
 * work.
 */
export function limitModel<L extends BaseLLM<any>>(
  llm: L,
  limits: { idleMs?: number; firstMs?: number; callMs?: number } = {},
): L {
  const idleMs = limits.idleMs ?? TIMEOUTS.MODEL_STREAM_IDLE;
  const firstMs = limits.firstMs ?? TIMEOUTS.MODEL_FIRST_CHUNK;
  const callMs = limits.callMs ?? TIMEOUTS.MODEL_CALL;
  const streamText = llm.streamText.bind(llm);
  const streamObject = llm.streamObject.bind(llm);
  const generateText = llm.generateText.bind(llm);
  const generateObject = llm.generateObject.bind(llm);
  llm.streamText = (input) =>
    withIdleLimit(streamText(input), { idleMs, firstMs });
  llm.streamObject = ((input) =>
    withIdleLimit(streamObject(input), {
      idleMs,
      firstMs,
    })) as typeof llm.streamObject;
  llm.generateText = (input) => withCallLimit(generateText(input), callMs);
  llm.generateObject = ((input) =>
    withCallLimit(generateObject(input), callMs)) as typeof llm.generateObject;
  return llm;
}
