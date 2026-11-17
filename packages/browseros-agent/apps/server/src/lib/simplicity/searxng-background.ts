/**
 * For pages that load by themselves (home news, Discover): they must not
 * wait for, or keep restarting, the one-time local search setup. Astro 0.2.4
 * QA, F-025: each home/Discover load started the SearXNG install and waited
 * for it inside the request.
 *
 * Returns the search URL when search runs. Otherwise it starts the setup in
 * the background at most once per server process and returns null at
 * once. A failed setup is never retried by itself, only by the Retry button
 * (F-002).
 */
export function makeSearxngURLWithoutWaiting(deps: {
  configuredURL: () => string;
  runningURL: () => string | null;
  start: () => Promise<string>;
}): () => string | null {
  let started = false;
  return () => {
    const url = deps.configuredURL() || deps.runningURL();
    if (url) return url;
    if (!started) {
      started = true;
      deps.start().catch(() => undefined);
    }
    return null;
  };
}
