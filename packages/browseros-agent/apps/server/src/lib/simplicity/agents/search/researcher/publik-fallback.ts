import type { UsageMeter } from '../../../pricing/meter';
import {
  type PublikSearchAccess,
  searchPublik,
} from '../../../publik-search';
import type { SearchReport } from '../../../search-report';
import type { Chunk, ResearchBlock } from '../../../types';
import { openableUrl } from './actions/search/baseSearch';

type BlockSession = {
  updateBlock: (id: string, patch: any[]) => void;
};

const dollars = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`;

/* F-088: when the local SearXNG gives no usable result (engines suspended
   for CAPTCHA or rate limits, or SearXNG down) and the turn's model runs on
   publik, search once with the publik search line. One call per turn; the
   charge goes on the turn's cost line as "web search". */
export const runPublikFallback = async (input: {
  access?: PublikSearchAccess;
  query: string;
  report: SearchReport;
  researchBlock: ResearchBlock;
  session: BlockSession;
  meter?: UsageMeter;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<Chunk[]> => {
  if (!input.access || input.report.usable > 0 || input.signal?.aborted)
    return [];

  const out = await searchPublik(input.access, input.query, {
    signal: input.signal,
    fetchImpl: input.fetchImpl,
  });

  if (!out.ok) {
    input.report.noteFallback(`publik web search also failed: ${out.reason}.`);
    return [];
  }

  if (out.chargeMicros > 0) {
    input.meter?.recordCharge({
      label: 'web search',
      model: 'publik-search',
      providerId: 'publik-search',
      providerType: 'openai',
      cost: out.chargeMicros / 1_000_000,
    });
  }

  const chunks: Chunk[] = out.hits
    .filter((h) => openableUrl(h.url))
    .map((h) => ({
      content: h.content,
      metadata: { title: h.title, url: h.url },
    }));

  const charged = out.chargeMicros > 0 ? ` (${dollars(out.chargeMicros)})` : '';

  if (chunks.length === 0) {
    input.report.noteFallback(`publik web search found no results${charged}.`);
    return [];
  }

  const steps = input.researchBlock.data.subSteps;
  steps.push(
    {
      id: crypto.randomUUID(),
      type: 'notice',
      level: 'info',
      text: `The local search engines gave no usable result. Astro searched with publik web search${charged}.`,
    },
    { id: crypto.randomUUID(), type: 'search_results', reading: chunks },
  );
  input.session.updateBlock(input.researchBlock.id, [
    { op: 'replace', path: '/data/subSteps', value: steps },
  ]);

  return chunks;
};
