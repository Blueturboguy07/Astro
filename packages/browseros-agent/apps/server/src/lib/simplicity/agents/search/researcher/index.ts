import {
  ActionOutput,
  ResearcherInput,
  ResearcherOutput,
  SearchAgentConfig,
} from '../types';
import { executeSearch } from './actions/search/baseSearch';
import uploadsSearchAction from './actions/uploadsSearch';
import { planQueries, refineQueries } from './queryPlanner';
import SessionManager from '../../../session';
import { Chunk, ResearchBlock } from '../../../types';
import { SearchReport } from '../../../search-report';
import { runPublikFallback } from './publik-fallback';
import {
  DISCUSSION_SITE,
  emptySourceNotice,
  pickVerticals,
  type VerticalName,
} from './verticals';

/* Deterministic, code-driven research.
 *
 * Search used to run inside a model tool-call loop whose only exit signal was
 * "the model made no tool calls" — which is also what a provider that cannot
 * emit tool calls (the Claude Code CLI, any text-only model) produces on every
 * turn. Those providers silently returned zero sources. Retrieval is a code
 * path now: the model plans queries (with a hard fallback to the raw
 * question), code runs the searches, and a model is consulted between rounds
 * only to decide whether MORE searching would help — never whether searching
 * happens at all. */

const ROUNDS: Record<'speed' | 'balanced' | 'quality', number> = {
  speed: 1,
  balanced: 2,
  quality: 3,
};

/* Deep Research hard caps. All of them are enforced in code — never by
   asking a model nicely — because the deterministic guarantee (retrieval
   always happens, and always stops) has to hold even when refinement always
   claims more rounds would help. */
const DEEP_RESEARCH_MAX_ROUNDS = 6;
const DEEP_RESEARCH_MAX_QUERIES_PER_ROUND = 3;
const DEEP_RESEARCH_MAX_SEARXNG_QUERIES = 20;
const DEEP_RESEARCH_MAX_WALL_CLOCK_MS = 240_000;
const DEEP_RESEARCH_MAX_RAW_CHUNKS = 60;

class Researcher {
  async research(
    session: SessionManager,
    input: ResearcherInput,
  ): Promise<ResearcherOutput> {
    const actionOutput: ActionOutput[] = [];
    const mode = input.config.mode;
    const utilityLLM = input.config.utilityLLM ?? input.config.llm;
    const standaloneQuery =
      input.classification.standaloneFollowUp || input.followUp;

    const researchBlockId = crypto.randomUUID();
    const report = new SearchReport();

    session.emitBlock({
      id: researchBlockId,
      type: 'research',
      data: {
        subSteps: [],
      },
    });

    const block = session.getBlock(researchBlockId) as ResearchBlock;

    const emitReasoning = (text: string) => {
      if (!block) return;
      block.data.subSteps.push({
        id: crypto.randomUUID(),
        type: 'reasoning',
        reasoning: text,
      });
      session.updateBlock(researchBlockId, [
        { op: 'replace', path: '/data/subSteps', value: block.data.subSteps },
      ]);
    };

    /* Which verticals to fan out to. Web runs whenever it is enabled; the
       classifier can only ADD verticals (academic, discussions), never remove
       web retrieval. */
    const verticals = pickVerticals(
      input.config.sources,
      input.classification.classification,
    );

    /* Hits per vertical over the whole turn, so a source the person chose
       that gave nothing is said plainly (F-076). */
    const verticalHits = new Map<VerticalName, number>();
    const discussionFallback = { tried: false, hits: 0 };

    const runVerticals = async (
      queries: string[],
      overrideMode?: SearchAgentConfig['mode'],
    ) => {
      const search = (
        searchConfig: (typeof verticals)[number]['searchConfig'],
        searchQueries: string[],
        site?: string,
      ) =>
        executeSearch({
          llm: utilityLLM,
          embedding: input.config.embedding,
          mode: overrideMode ?? mode,
          queries: searchQueries,
          researchBlock: block,
          session,
          searchConfig,
          report,
          site,
        });

      const results = await Promise.all(
        verticals.map(async (vertical) => {
          try {
            const found = await search(vertical.searchConfig, queries);
            verticalHits.set(
              vertical.name,
              (verticalHits.get(vertical.name) ?? 0) + found.length,
            );
            /* Reddit refused or found nothing: the same questions on the
               general web engines, limited to reddit.com (once a turn). */
            if (
              found.length === 0 &&
              vertical.name === 'discussions' &&
              !discussionFallback.tried &&
              !input.config.signal?.aborted
            ) {
              discussionFallback.tried = true;
              const viaWeb = await search(undefined, queries, DISCUSSION_SITE);
              discussionFallback.hits += viaWeb.length;
              return viaWeb;
            }
            return found;
          } catch (err) {
            console.error(`Search vertical '${vertical.name}' failed:`, err);
            verticalHits.set(vertical.name, verticalHits.get(vertical.name) ?? 0);
            return [] as Chunk[];
          }
        }),
      );

      return results.flat();
    };

    const seenQueries = new Set<string>();
    const allTitles: string[] = [];
    let plan = await planQueries({
      llm: utilityLLM,
      standaloneQuery,
      chatHistory: input.chatHistory,
      mode,
    });

    const isDeepResearch = input.config.searchMode === 'deepResearch';

    /* Tracked across the whole turn (not just the deep-research loop) so the
       zero-result backstop below can also respect the query cap. */
    let deepResearchSearxngQueries = 0;

    if (isDeepResearch) {
      const startedAt = Date.now();
      let rawChunks = 0;
      /* Every vertical gets fanned the same query list, so one "query" costs
         `verticals.length` real SearxNG calls — the budget below accounts
         for that instead of just counting query strings. */
      const verticalCount = Math.max(verticals.length, 1);

      for (
        let round = 0;
        round < DEEP_RESEARCH_MAX_ROUNDS;
        round++
      ) {
        if (input.config.signal?.aborted) break;
        if (Date.now() - startedAt > DEEP_RESEARCH_MAX_WALL_CLOCK_MS) break;
        if (deepResearchSearxngQueries >= DEEP_RESEARCH_MAX_SEARXNG_QUERIES)
          break;
        if (rawChunks >= DEEP_RESEARCH_MAX_RAW_CHUNKS) break;

        const remainingQueryBudget = Math.floor(
          (DEEP_RESEARCH_MAX_SEARXNG_QUERIES - deepResearchSearxngQueries) /
            verticalCount,
        );
        if (remainingQueryBudget <= 0) break;

        const queries = plan.queries
          .filter((q) => !seenQueries.has(q.toLowerCase().trim()))
          .slice(
            0,
            Math.min(DEEP_RESEARCH_MAX_QUERIES_PER_ROUND, remainingQueryBudget),
          );

        if (queries.length === 0) break;

        queries.forEach((q) => seenQueries.add(q.toLowerCase().trim()));
        emitReasoning(plan.plan);

        /* Breadth pass: same shape as the normal loop, always 'balanced'
           regardless of the user's speed/balanced/quality tier. */
        deepResearchSearxngQueries += queries.length * verticalCount;
        const breadthResults = await runVerticals(queries, 'balanced');

        if (breadthResults.length > 0) {
          actionOutput.push({ type: 'search_results', results: breadthResults });
          rawChunks += breadthResults.length;
          breadthResults.forEach((r) => {
            if (r.metadata.title) allTitles.push(r.metadata.title);
          });
        }

        /* Every second round, additionally scrape+extract the single best
           refined query so the report gets full-page depth, not just search
           snippets — 'quality' mode already does picker -> scrape -> extract
           via the utility LLM. */
        const isQualityRound = (round + 1) % 2 === 0;
        if (
          isQualityRound &&
          !input.config.signal?.aborted &&
          deepResearchSearxngQueries + verticalCount <=
            DEEP_RESEARCH_MAX_SEARXNG_QUERIES &&
          rawChunks < DEEP_RESEARCH_MAX_RAW_CHUNKS
        ) {
          deepResearchSearxngQueries += verticalCount;
          const bestQuery = queries[0];
          const qualityResults = await runVerticals([bestQuery], 'quality');

          if (qualityResults.length > 0) {
            actionOutput.push({
              type: 'search_results',
              results: qualityResults,
            });
            rawChunks += qualityResults.length;
            qualityResults.forEach((r) => {
              if (r.metadata.title) allTitles.push(r.metadata.title);
            });
          }
        }

        const lastRound = round === DEEP_RESEARCH_MAX_ROUNDS - 1;
        if (
          lastRound ||
          input.config.signal?.aborted ||
          Date.now() - startedAt > DEEP_RESEARCH_MAX_WALL_CLOCK_MS ||
          deepResearchSearxngQueries >= DEEP_RESEARCH_MAX_SEARXNG_QUERIES ||
          rawChunks >= DEEP_RESEARCH_MAX_RAW_CHUNKS
        ) {
          break;
        }

        /* Always attempt refinement between rounds — the only way this loop
           ends before the hard caps is refinement saying "sufficient". */
        const refinement = await refineQueries({
          llm: utilityLLM,
          standaloneQuery,
          previousQueries: Array.from(seenQueries),
          resultTitles: allTitles,
        });

        if (!refinement) break;
        plan = refinement;
      }
    } else {
      const rounds = ROUNDS[mode] ?? 1;

      for (let round = 0; round < rounds; round++) {
        if (input.config.signal?.aborted) break;

        const queries = plan.queries
          .filter((q) => !seenQueries.has(q.toLowerCase().trim()))
          .slice(0, 3);

        if (queries.length === 0) break;

        queries.forEach((q) => seenQueries.add(q.toLowerCase().trim()));
        emitReasoning(plan.plan);

        const roundResults = await runVerticals(queries);

        if (roundResults.length > 0) {
          actionOutput.push({ type: 'search_results', results: roundResults });
          roundResults.forEach((r) => {
            if (r.metadata.title) allTitles.push(r.metadata.title);
          });
        }

        const lastRound = round === rounds - 1;
        if (lastRound || input.config.signal?.aborted) break;

        const refinement = await refineQueries({
          llm: utilityLLM,
          standaloneQuery,
          previousQueries: Array.from(seenQueries),
          resultTitles: allTitles,
        });

        if (!refinement) break;
        plan = refinement;
      }
    }

    if (!input.config.signal?.aborted) {
      for (const vertical of verticals) {
        /* Only a source that ran and found nothing. */
        const hits = verticalHits.get(vertical.name);
        if (vertical.name === 'web' || hits === undefined || hits > 0) continue;
        block.data.subSteps.push({
          id: crypto.randomUUID(),
          type: 'notice',
          level: 'error',
          text: emptySourceNotice(
            vertical.name,
            report.failure().engines,
            vertical.name === 'discussions' ? discussionFallback.hits : undefined,
          ),
        });
        session.updateBlock(researchBlockId, [
          { op: 'replace', path: '/data/subSteps', value: block.data.subSteps },
        ]);
      }
    }

    /* Files attached to the chat are always searched — no model gate here
       either. */
    if (input.config.fileIds.length > 0 && !input.config.signal?.aborted) {
      try {
        const uploadResults = await uploadsSearchAction.execute(
          { queries: [standaloneQuery, ...Array.from(seenQueries)].slice(0, 3) },
          {
            llm: input.config.llm,
            embedding: input.config.embedding,
            session,
            researchBlockId,
            fileIds: input.config.fileIds,
            mode,
          },
        );
        actionOutput.push(uploadResults);
      } catch (err) {
        console.error('Uploads search failed:', err);
      }
    }

    /* Backstop: searching was intended, so an empty result set means the
       queries failed us, not that no search was wanted. One plain retry with
       the question verbatim before giving up. */
    const foundAnything = actionOutput.some(
      (a) => a.type === 'search_results' && a.results.length > 0,
    );

    if (
      !foundAnything &&
      !seenQueries.has(standaloneQuery.toLowerCase().trim()) &&
      !input.config.signal?.aborted &&
      (!isDeepResearch ||
        deepResearchSearxngQueries < DEEP_RESEARCH_MAX_SEARXNG_QUERIES)
    ) {
      try {
        const backstopResults = await executeSearch({
          llm: utilityLLM,
          embedding: input.config.embedding,
          mode: mode === 'quality' ? 'balanced' : mode,
          queries: [standaloneQuery],
          researchBlock: block,
          session,
          report,
        });
        if (backstopResults.length > 0) {
          actionOutput.push({ type: 'search_results', results: backstopResults });
        }
      } catch (err) {
        console.error('Backstop search failed:', err);
      }
    }

    /* Attached files that matched are enough to answer from: no paid
       search then. */
    const haveResults = actionOutput.some(
      (a) => a.type === 'search_results' && a.results.length > 0,
    );
    const fallbackResults = await runPublikFallback({
      access: haveResults ? undefined : input.config.publikSearch,
      query: standaloneQuery,
      report,
      researchBlock: block,
      session,
      meter: input.config.usageMeter,
      signal: input.config.signal,
    });
    if (fallbackResults.length > 0) {
      actionOutput.push({ type: 'search_results', results: fallbackResults });
    }

    const searchResults = actionOutput
      .filter((a) => a.type === 'search_results')
      .flatMap((a) => a.results);

    const seenUrls = new Map<string, number>();

    const filteredSearchResults = searchResults
      .map((result, index) => {
        if (result.metadata.url && !seenUrls.has(result.metadata.url)) {
          seenUrls.set(result.metadata.url, index);
          return result;
        } else if (result.metadata.url && seenUrls.has(result.metadata.url)) {
          const existingIndex = seenUrls.get(result.metadata.url)!;

          const existingResult = searchResults[existingIndex];

          existingResult.content += `\n\n${result.content}`;

          return undefined;
        }

        return result;
      })
      .filter((r) => r !== undefined);

    session.emitBlock({
      id: crypto.randomUUID(),
      type: 'source',
      data: filteredSearchResults,
    });

    /* Nothing to write from: the writer would only say it found nothing
       (F-088). The agents show the failure instead. */
    const searchFailed =
      filteredSearchResults.length === 0 && !input.config.signal?.aborted
        ? report.failure()
        : undefined;

    return {
      findings: actionOutput,
      searchFindings: filteredSearchResults,
      ...(searchFailed && { searchFailed }),
    };
  }
}

export default Researcher;
