import { TIMEOUTS } from '@browseros/shared/constants/timeouts';
import { withIdleLimit as limitIdle } from '../../models/time-limits';

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
export function withIdleLimit<T>(
  source: AsyncGenerator<T>,
  idleMs: number = TIMEOUTS.MODEL_STREAM_IDLE,
): AsyncGenerator<T> {
  return limitIdle(source, {
    idleMs,
    makeError: (ms) => new MemberIdleError(ms),
  });
}
