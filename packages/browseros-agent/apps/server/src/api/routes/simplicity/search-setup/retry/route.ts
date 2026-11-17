import { retrySearchSetup } from '../../../../../lib/searxng/provision';

/* The Retry button under a failed web search. Astro never retries the
   setup by itself (F-002); this starts one new attempt in the background. */
export const POST = async () => {
  retrySearchSetup();
  return Response.json({ started: true }, { status: 202 });
};
