/**
 * Word-overlap relevance for an uploaded file's parts, used when there is
 * no embedding model (a publik-only setup) or the stored vectors do not
 * match the current model. With zero vectors every part scored the same
 * and the answer got arbitrary parts of the file (Astro 0.2.4 QA, F-068).
 */
const STOP = new Set(
  'a an and are as at be by for from has have how in is it its of on or that the this to was were what when where which who why will with you your'.split(
    ' ',
  ),
);

export function words(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (w) => w.length > 1 && !STOP.has(w),
  );
}

/** Higher is more relevant; 0 means no query word appears. */
export function keywordScore(query: string, content: string): number {
  const q = new Set(words(query));
  if (q.size === 0) return 0;
  const counts = new Map<string, number>();
  const all = words(content);
  for (const w of all) counts.set(w, (counts.get(w) ?? 0) + 1);
  let score = 0;
  for (const w of q) {
    const n = counts.get(w) ?? 0;
    if (n > 0) score += 1 + Math.log(n);
  }
  return score / Math.sqrt(1 + all.length / 100);
}

/** True when a vector carries no signal (NullEmbedding gives zeros). */
export const hasSignal = (v: number[] | undefined): v is number[] =>
  !!v && v.some((x) => x !== 0);
