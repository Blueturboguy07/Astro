import { TIMEOUTS } from '@browseros/shared/constants/timeouts';

export class MemberIdleError extends Error {
  constructor(idleMs: number) {
    super(
      `No answer from this model for ${Math.round(idleMs / 1000)} seconds. The council went on without it.`,
    );
    this.name = 'MemberIdleError';
  }
}

/**
 * Yields from `source` but throws MemberIdleError when no chunk arrives for
 * `idleMs`, and closes the source. One stalled member (publik Fast did not
 * answer for minutes) held the whole council and its chair on "Thinking…"
 * (Astro 0.2.4 QA, F-055 retest).
 */
export async function* withIdleLimit<T>(
  source: AsyncGenerator<T>,
  idleMs: number = TIMEOUTS.MODEL_STREAM_IDLE,
): AsyncGenerator<T> {
  const it = source[Symbol.asyncIterator]();
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const idle = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new MemberIdleError(idleMs)), idleMs);
      });
      let step: IteratorResult<T>;
      try {
        step = await Promise.race([it.next(), idle]);
      } finally {
        clearTimeout(timer);
      }
      if (step.done) return;
      yield step.value;
    }
  } finally {
    /* Do not wait: a stalled source may never settle its return(). */
    void Promise.resolve(it.return?.(undefined)).catch(() => {});
  }
}
