import { Chunk } from '../../types';
import { getTokenCount } from '../../utils/splitText';

/* The writer context must be bounded. Deep Research can legally gather 60
   chunks of scraped-and-extracted pages — unbounded, that's hundreds of KB,
   which overflows model context windows and, on the Claude Code CLI (where
   the whole system prompt travels as one argv entry), can exceed the OS
   argument-size limit and kill the call outright. Chunks arrive
   relevance-sorted, so truncating the tail costs the least. */

const PER_CHUNK_CHAR_CAP = 8_000;

export const CONTEXT_TOKEN_BUDGET: Record<'search' | 'deepResearch', number> = {
  search: 16_000,
  deepResearch: 32_000,
};

export const budgetChunks = (chunks: Chunk[], maxTokens: number): Chunk[] => {
  const out: Chunk[] = [];
  let used = 0;

  for (const chunk of chunks) {
    const content =
      chunk.content.length > PER_CHUNK_CHAR_CAP
        ? chunk.content.slice(0, PER_CHUNK_CHAR_CAP) + '…'
        : chunk.content;

    const tokens = getTokenCount(content);
    if (used + tokens > maxTokens && out.length > 0) break;

    out.push(
      content === chunk.content ? chunk : { ...chunk, content },
    );
    used += tokens;
  }

  return out;
};
