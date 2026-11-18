import type { SearchFailure } from './types';

export type UnresponsiveEngine = { engine: string; reason: string };

const MAX_REASON = 120;

const clip = (s: string) =>
  s.length > MAX_REASON ? `${s.slice(0, MAX_REASON - 1)}…` : s;

/* SearXNG lists the engines that failed a query as [name, reason] pairs
   ("duckduckgo", "CAPTCHA"). Dropping them left the answer with no way to
   say why it found nothing (F-088). */
export const readUnresponsive = (raw: unknown): UnresponsiveEngine[] => {
  if (!Array.isArray(raw)) return [];
  const out: UnresponsiveEngine[] = [];
  for (const item of raw) {
    if (!Array.isArray(item) || typeof item[0] !== 'string') continue;
    const engine = item[0].trim();
    if (!engine) continue;
    const reason =
      typeof item[1] === 'string' && item[1].trim()
        ? clip(item[1].trim())
        : 'no answer';
    out.push({ engine, reason });
  }
  return out;
};

const errorText = (err: unknown): string =>
  clip(err instanceof Error ? err.message : String(err));

/* One per answer turn: what web search did over all of its queries,
   verticals and rounds. */
export class SearchReport {
  private usableHits = 0;
  private engines = new Map<string, string>();
  private errors = new Set<string>();
  private fallbackNote: string | undefined;

  noteEngines(list: UnresponsiveEngine[]) {
    for (const e of list) {
      if (!this.engines.has(e.engine)) this.engines.set(e.engine, e.reason);
    }
  }

  noteError(err: unknown) {
    this.errors.add(errorText(err));
  }

  noteUsable(n: number) {
    this.usableHits += n;
  }

  noteFallback(text: string) {
    this.fallbackNote = text;
  }

  get usable() {
    return this.usableHits;
  }

  failure(): SearchFailure {
    return {
      engines: [...this.engines].map(([engine, reason]) => ({
        engine,
        reason,
      })),
      errors: [...this.errors],
      ...(this.fallbackNote && { fallback: this.fallbackNote }),
    };
  }
}

/* The writer is skipped only when the turn has nothing to write from: no
   source and no widget. A widget (weather, stock, calculation) already
   answers on screen, so its turn keeps the writer. */
export const searchFailureToShow = (
  research: { searchFailed?: SearchFailure } | null,
  widgetCount: number,
  signal?: AbortSignal,
): SearchFailure | null =>
  research?.searchFailed && widgetCount === 0 && !signal?.aborted
    ? research.searchFailed
    : null;
