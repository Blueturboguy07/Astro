import { and, eq } from 'drizzle-orm';
import db from '../../db';
import { messages } from '../../db/schema';
import type SessionManager from '../../session';
import { turnEndStatus } from '../../turn-end';
import type { SearchFailure } from '../../types';
import type { SearchAgentConfig } from './types';

/* Ends a turn whose web search gave nothing to write from (F-088): the
   "Web search failed" block instead of an answer, the cost so far, and a
   completed row so the card stays after a reload. No writer call: it could
   only say it found nothing, or make an answer up. */
export const endWithSearchFailed = async (
  session: SessionManager,
  input: { config: SearchAgentConfig; chatId: string; messageId: string },
  failure: SearchFailure,
) => {
  session.emitBlock({
    id: crypto.randomUUID(),
    type: 'searchFailed',
    data: failure,
  });

  if (input.config.usageMeter) {
    const summary = input.config.usageMeter.summarize();
    if (summary.breakdown.length > 0) {
      session.emitBlock({
        id: crypto.randomUUID(),
        type: 'usage',
        data: summary,
      });
    }
  }

  session.emit('end', turnEndStatus(false));

  if (input.config.incognito) return;
  await db
    .update(messages)
    .set({ status: 'completed', responseBlocks: session.getAllBlocks() })
    .where(
      and(
        eq(messages.chatId, input.chatId),
        eq(messages.messageId, input.messageId),
      ),
    )
    .execute();
};
