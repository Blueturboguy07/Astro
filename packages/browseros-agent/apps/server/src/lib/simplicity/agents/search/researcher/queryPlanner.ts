import z from 'zod/v4';
import BaseLLM from '../../../models/base/llm';
import { ChatTurnMessage } from '../../../types';
import formatChatHistoryAsString from '../../../utils/formatHistory';
import { generateObjectWithRetry } from '../../../utils/generateObjectWithRetry';
import { SearchAgentConfig } from '../types';

/* Search queries are planned by code, not chosen by the answering model.
   Retrieval always happens once the agent decides to search — the only thing
   the LLM contributes here is WHAT to search for, and even that has a
   deterministic fallback (the standalone question verbatim), so a misbehaving
   model can degrade query quality but can never zero out retrieval. */

const planSchema = z.object({
  plan: z
    .string()
    .describe(
      "One short present-participle phrase describing what is being researched, e.g. 'Researching current Tesla stock performance'. No trailing period.",
    ),
  queries: z
    .array(z.string())
    .describe(
      'Search-engine queries: short, keyword-style, SEO-friendly. Each query targets a different aspect of the question.',
    ),
});

const refineSchema = z.object({
  sufficient: z
    .boolean()
    .describe(
      'true if the results gathered so far can fully answer the question; false if important aspects are still uncovered.',
    ),
  plan: z
    .string()
    .describe(
      "One short present-participle phrase describing the follow-up angle, e.g. 'Digging into Q2 earnings details'.",
    ),
  queries: z
    .array(z.string())
    .describe(
      'Follow-up queries covering what is still missing. Empty if sufficient.',
    ),
});

export type QueryPlan = {
  plan: string;
  queries: string[];
};

const QUERY_COUNT: Record<SearchAgentConfig['mode'], number> = {
  speed: 3,
  balanced: 3,
  quality: 3,
};

const plannerPrompt = (queryCount: number) => `
You plan web searches for an answer engine. Today's date is ${new Date().toDateString()} — use the CURRENT year in time-sensitive queries, never a stale one. Given a conversation and the user's standalone question, produce up to ${queryCount} search-engine queries that together cover the question.

Rules:
- Queries are keywords, not sentences: "GPT-5.1 release date", not "When was GPT-5.1 released?".
- Split distinct aspects into distinct queries instead of one broad query.
- Include a year or "latest" when freshness matters.
- Keep entity names exactly as the user wrote them.
- Also produce a one-line "plan": a short present-participle phrase describing the research direction (shown to the user while searching).
`;

const refinerPrompt = () => `
You review interim web-search results for an answer engine and decide whether another round of searching is needed. Today's date is ${new Date().toDateString()}.

You are given the user's question, the queries already run, and the titles of results found so far. Decide:
- "sufficient": can the question be fully answered from these results? Be strict about coverage — if a distinct aspect of the question has no matching results, it is not sufficient.
- If not sufficient, produce up to 3 NEW queries targeting only what is missing. Never repeat or trivially rephrase queries that were already run.
`;

export const planQueries = async (input: {
  llm: BaseLLM<any>;
  standaloneQuery: string;
  chatHistory: ChatTurnMessage[];
  mode: SearchAgentConfig['mode'];
}): Promise<QueryPlan> => {
  const queryCount = QUERY_COUNT[input.mode];

  try {
    const output = await generateObjectWithRetry<typeof planSchema>(input.llm, {
      schema: planSchema,
      messages: [
        { role: 'system', content: plannerPrompt(queryCount) },
        {
          role: 'user',
          content: `<conversation>\n${formatChatHistoryAsString(input.chatHistory.slice(-6))}\n</conversation>\n<question>${input.standaloneQuery}</question>`,
        },
      ],
    });

    const queries = (output.queries ?? [])
      .filter((q: string) => typeof q === 'string' && q.trim().length > 0)
      .slice(0, queryCount);

    if (queries.length > 0) {
      return { plan: output.plan || `Searching for ${input.standaloneQuery}`, queries };
    }
  } catch (err) {
    console.error('Query planning failed, falling back to raw question:', err);
  }

  /* The guarantee: planning can fail, searching still happens. */
  return {
    plan: `Searching for ${input.standaloneQuery}`,
    queries: [input.standaloneQuery],
  };
};

export const refineQueries = async (input: {
  llm: BaseLLM<any>;
  standaloneQuery: string;
  previousQueries: string[];
  resultTitles: string[];
}): Promise<QueryPlan | null> => {
  try {
    const output = await generateObjectWithRetry<typeof refineSchema>(
      input.llm,
      {
        schema: refineSchema,
        messages: [
          { role: 'system', content: refinerPrompt() },
          {
            role: 'user',
            content: `<question>${input.standaloneQuery}</question>\n<queries_already_run>\n${input.previousQueries.join('\n')}\n</queries_already_run>\n<result_titles>\n${input.resultTitles.slice(0, 30).join('\n')}\n</result_titles>`,
          },
        ],
      },
    );

    if (output.sufficient) return null;

    const queries = (output.queries ?? [])
      .filter((q: string) => typeof q === 'string' && q.trim().length > 0)
      .filter((q: string) => !input.previousQueries.includes(q))
      .slice(0, 3);

    if (queries.length === 0) return null;

    return { plan: output.plan || 'Digging deeper', queries };
  } catch (err) {
    /* Refinement is best-effort — round one already produced results. */
    console.error('Query refinement failed, stopping after current round:', err);
    return null;
  }
};
