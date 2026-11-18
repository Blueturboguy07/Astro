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
