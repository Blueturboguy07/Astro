import { MinimalProvider } from '../../models/types';
import { availableRows, resolveBest, BEST_ORDER, ResolvedRow } from '../../models/catalog';
import { resolvePricingKey, estimateCostUSD } from '../../pricing/table';
import { getTokenCount } from '../../utils/splitText';

/* Model Council member/chair selection (SPEC 2 §3) + the pre-run cost hint
 * (§7). Pure functions over `MinimalProvider[]` — no I/O, no LLM calls — so
 * they're trivially unit-testable against fake provider lists.
 */

export const MAX_COUNCIL_MEMBERS = 3;
export const MIN_COUNCIL_MEMBERS = 2;

const typeOfProvider = (providers: MinimalProvider[], providerId: string): string =>
  providers.find((p) => p.id === providerId)?.type ?? 'unknown';

/* Rank by the exact same quality/cost preference order "Best" uses
   (BEST_ORDER, catalog.ts) so auto-pick and "Best" never disagree about
   what's good. A row whose resolved candidate isn't in BEST_ORDER at all
   (e.g. GPT-OSS 20B, Claude Opus 4.8) ranks after everything that is —
   still eligible, just never preferred over a ranked option, so a
   single-vendor setup isn't left short of members. */
const qualityRank = (providerType: string, key: string): number => {
  const idx = BEST_ORDER.findIndex((c) => c.providerType === providerType && c.key === key);
  return idx === -1 ? BEST_ORDER.length : idx;
};

/* Default the 3 highest-quality DISTINCT-VENDOR rows: walk resolved rows in
   BEST_ORDER's preference order, keep the first row per distinct vendor
   (the row's resolved providerType — e.g. two rows that both resolved
   through 'openai' count as the same vendor even if their catalog rows
   differ), cap at 3. If fewer than 3 distinct vendors are connected, this
   returns what exists (the MIN_COUNCIL_MEMBERS floor is enforced by
   canRunCouncil at the entry point, not here). */
export const autoPickCouncil = (providers: MinimalProvider[]): ResolvedRow[] => {
  const ranked = availableRows(providers)
    .map((row) => ({ row, providerType: typeOfProvider(providers, row.providerId) }))
    .sort(
      (a, b) =>
        qualityRank(a.providerType, a.row.key) - qualityRank(b.providerType, b.row.key),
    );

  const picked: ResolvedRow[] = [];
  const seenVendors = new Set<string>();

  for (const { row, providerType } of ranked) {
    if (seenVendors.has(providerType)) continue;
    seenVendors.add(providerType);
    picked.push(row);
    if (picked.length >= MAX_COUNCIL_MEMBERS) break;
  }

  return picked;
};

/* Whether Model Council can run at all for this connection set — the hard
   gate the composer's mode entry disables against (a real disable, not a
   submit-time error) and the chat route re-checks server-side as a
   defensive backstop.

   Deliberately checks autoPickCouncil's DISTINCT-VENDOR output, not the raw
   availableRows() count: two connected rows that both resolve through the
   same vendor (e.g. only OpenAI connected, exposing both GPT-5.1 and
   GPT-5 mini) pass a naive "rows.length >= 2" check but still only ever
   yield a single council member — this must gate on what auto-pick can
   actually produce, not on the row count alone. */
export const canRunCouncil = (providers: MinimalProvider[]): boolean =>
  autoPickCouncil(providers).length >= MIN_COUNCIL_MEMBERS;

/* Chair defaults to "Best-resolved" (catalog.ts's resolveBest) — divergence
   from Perplexity's fixed/invisible chair (SPEC 2 §0.2). Falls back to
   whichever row autoPickCouncil ranked first when nothing in BEST_ORDER
   resolves (e.g. only non-flagship rows like GPT-5 mini + GPT-OSS 20B are
   connected) so the council never ends up chairless. */
export const pickChair = (
  providers: MinimalProvider[],
): { providerId: string; key: string } | null => {
  const best = resolveBest(providers);
  if (best) return best;

  const [fallback] = autoPickCouncil(providers);
  return fallback ? { providerId: fallback.providerId, key: fallback.key } : null;
};

export type CouncilCostEstimate = {
  totalUSD: number | null;
  free: boolean;
  perMember: { rowId: string; usd: number | null; free: boolean }[];
};

/* Heuristic completion lengths for the PRE-run estimate (§7) — the real
   post-run cost is read back from the shared UsageMeter once members/chair
   actually finish (see CouncilAgent), which is exact rather than a guess. */
const MEMBER_COMPLETION_HEURISTIC_TOKENS = 800;
const CHAIR_COMPLETION_HEURISTIC_TOKENS = 1200;

/**
 * Rough pre-run USD estimate for the chosen members + chair, computed from
 * the actual shared prompt's token count plus a heuristic completion length
 * per role. Free paths (local Ollama, a connected Claude Code plan) always
 * estimate to `null`/free regardless of token counts.
 */
export const estimateCouncilCost = (
  promptText: string,
  members: { rowId: string; providerType: string; key: string }[],
  chair: { providerType: string; key: string },
): CouncilCostEstimate => {
  const promptTokens = getTokenCount(promptText);

  const estimateOne = (providerType: string, key: string, completionTokens: number) => {
    const pricingKey = resolvePricingKey(providerType, key);
    const usd = estimateCostUSD(pricingKey, {
      inputTokens: promptTokens,
      outputTokens: completionTokens,
    });
    return { usd, free: usd == null };
  };

  const perMember = members.map((m) => {
    const { usd, free } = estimateOne(m.providerType, m.key, MEMBER_COMPLETION_HEURISTIC_TOKENS);
    return { rowId: m.rowId, usd, free };
  });

  const chairEstimate = estimateOne(
    chair.providerType,
    chair.key,
    CHAIR_COMPLETION_HEURISTIC_TOKENS,
  );

  const free = perMember.every((m) => m.free) && chairEstimate.free;
  const totalUSD = free
    ? null
    : perMember.reduce((sum, m) => sum + (m.usd ?? 0), 0) + (chairEstimate.usd ?? 0);

  return { totalUSD, free, perMember };
};
