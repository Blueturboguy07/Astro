import type { UsageBlock } from '@/lib/simplicity/types'

/* Splits a turn's usage into model calls and paid web searches (F-088): a
   search has no tokens and is not a model, so it is not counted as one. */
export const usageParts = (data: UsageBlock['data']) => {
  const searches = data.breakdown.filter((e) => e.kind === 'search')
  const models = data.breakdown.filter((e) => e.kind !== 'search')
  return {
    tokens: models.reduce((s, e) => s + e.inputTokens + e.outputTokens, 0),
    modelCount: models.length,
    searchCount: searches.reduce((s, e) => s + (e.count ?? 1), 0),
    searchCost: searches.reduce((s, e) => s + (e.cost ?? 0), 0),
  }
}

/* What a row with no price shows. publik bills its own models from the
   wallet at its per-token price; Astro has no copy of that price list, so
   the row says who bills it instead of a bare "—" (INV-DOCS-23). */
export const unpricedLabel = (model: string): string =>
  model.startsWith('publik-') ? 'billed by publik' : 'no price data'

/* The Total row is shown only when Astro knows the total: free, or every
   paid row priced. "Total —" read as a missing number (INV-DOCS-23). */
export const showTotal = (data: UsageBlock['data']): boolean =>
  data.free || data.priced !== false
