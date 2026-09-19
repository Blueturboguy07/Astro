/**
 * Drizzle schema for Simplicity's chat history (`chats` / `messages`).
 *
 * Ported from Vane by ItzCrazyKns under MIT — see
 * apps/app/screens/simplicity/ATTRIBUTION.md. Column shapes are inferred
 * from how the ported route handlers and search/council agents read and
 * write these tables (there was no upstream schema file to copy: see
 * db/index.ts for why).
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const chats = sqliteTable('chats', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: text('created_at').notNull(),
  /* Enabled search sources for the thread (web/academic/social/...). */
  sources: text('sources', { mode: 'json' }).$type<string[]>().notNull(),
  files: text('files', { mode: 'json' })
    .$type<{ fileId: string; name: string }[]>()
    .notNull(),
});

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: text('chat_id').notNull(),
  messageId: text('message_id').notNull(),
  /* SessionManager id for the turn that produced this row — used by
     /api/reconnect/:id to resume a stream after a client reconnect. */
  backendId: text('backend_id').notNull(),
  query: text('query').notNull(),
  createdAt: text('created_at').notNull(),
  status: text('status', {
    enum: ['answering', 'completed', 'cancelled', 'error'],
  }).notNull(),
  /* Ordered Block[] (text/source/widget/research/usage/council/error) that
     makes up the rendered answer; see ../types.ts's `Block` union. */
  responseBlocks: text('response_blocks', { mode: 'json' })
    .$type<unknown[]>()
    .notNull(),
});

export type ChatRow = InferSelectModel<typeof chats>;
export type NewChatRow = InferInsertModel<typeof chats>;
export type MessageRow = InferSelectModel<typeof messages>;
export type NewMessageRow = InferInsertModel<typeof messages>;
