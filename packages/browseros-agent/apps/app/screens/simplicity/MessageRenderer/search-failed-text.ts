import type { SearchFailedBlock } from '@/lib/simplicity/types'

const SEARCH_FAILED_TITLE = 'Web search failed'

/* Words for the "Web search failed" card (F-088). Older or partial blocks
   can miss a field: the card still says what it can. */
export const searchFailedText = (
  data: Partial<SearchFailedBlock['data']> | undefined,
) => {
  const engines = Array.isArray(data?.engines) ? data.engines : []
  const errors = Array.isArray(data?.errors) ? data.errors : []
  const intro =
    engines.length > 0
      ? 'These search engines did not answer:'
      : errors.length > 0
        ? 'The web search gave an error:'
        : 'The search engines answered, but no result matched the question.'
  return {
    title: SEARCH_FAILED_TITLE,
    intro,
    lines: [...engines.map((e) => `${e.engine}: ${e.reason}`), ...errors],
    ...(typeof data?.fallback === 'string' &&
      data.fallback.trim() && { fallback: data.fallback.trim() }),
    footer:
      'Astro did not write an answer without web sources. Press Retry to search again.',
  }
}
