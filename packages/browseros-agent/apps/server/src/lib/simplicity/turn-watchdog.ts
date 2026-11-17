/**
 * Ends an answer turn that makes no progress. The model calls have their
 * own limits (models/time-limits.ts); this catches any other wait without
 * an end (a page fetch, a search request), so no turn shows
 * "Brainstorming..." with Stop for ever (Astro 0.2.4 QA, F-059).
 */
export function turnWatchdog(idleMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let done = false;
  let fail: (err: Error) => void = () => {};
  const stalled = new Promise<never>((_, reject) => {
    fail = reject;
  });
  stalled.catch(() => {});

  const arm = () => {
    if (done) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      done = true;
      fail(
        new Error(
          `The answer stopped: nothing new for ${Math.round(idleMs / 60_000)} minutes. Press Retry.`,
        ),
      );
    }, idleMs);
  };
  arm();

  return {
    stalled,
    touch: arm,
    stop() {
      done = true;
      clearTimeout(timer);
    },
  };
}
