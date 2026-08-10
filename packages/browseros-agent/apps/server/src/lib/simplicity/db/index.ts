/**
 * Simplicity's chat-history database (the `chats` / `messages` tables
 * queried by the /api/chat* routes and the search/council agents).
 *
 * Upstream Vane's `src/lib/db/` never made it into this fork's port commit
 * (`feat: replace agent UI with Simplicity and rebrand to Astro`) — the
 * route handlers and agents were vendored with `import db from
 * '../../../../lib/simplicity/db'` already in place, but the module itself
 * was never created. Since that import sits at the top of
 * `api/routes/simplicity/chats/route.ts`, which `api/routes/simplicity/
 * index.ts` imports eagerly to build the Hono router, the whole server
 * process crashed on boot with "Cannot find module
 * '../../../../lib/simplicity/db'" before it could open a port.
 *
 * This recreates that module: same directory layout as
 * `../config/index.ts` (so `simplicity.db` sits next to `config.json`), and
 * the same lazy-Proxy-on-first-access pattern that module uses — instantiate
 * at module scope and merely importing a route (e.g. under `bun test`)
 * creates directories and opens a database file on disk.
 */
import { Database as BunDatabase } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { type BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite';
import { getBrowserosDir } from '../../browseros-dir';
import * as schema from './schema';

export type SimplicityDatabase = BunSQLiteDatabase<typeof schema>;

/* Mirrors config/index.ts's resolveConfigDir() so simplicity.db and
   config.json always live side by side. */
function resolveDataDir(): string {
  const dir = process.env.DATA_DIR
    ? path.join(process.env.DATA_DIR, 'data')
    : path.join(getBrowserosDir(), 'simplicity');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function openDb(): SimplicityDatabase {
  const dbPath = path.join(resolveDataDir(), 'simplicity.db');
  const sqlite = new BunDatabase(dbPath);
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('PRAGMA foreign_keys = ON');

  /* No drizzle-kit migrations for this table set (it never had one to
     port) — bootstrap directly, same as client.ts's fallback path does
     when packaged builds ship without a migrations folder. */
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      sources TEXT NOT NULL,
      files TEXT NOT NULL
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      backend_id TEXT NOT NULL,
      query TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      response_blocks TEXT NOT NULL
    )
  `);
  sqlite.exec(
    'CREATE INDEX IF NOT EXISTS messages_chat_id_idx ON messages (chat_id)',
  );
  sqlite.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS messages_chat_message_unique ON messages (chat_id, message_id)',
  );

  return drizzle(sqlite, { schema });
}

let instance: SimplicityDatabase | undefined;

const db = new Proxy({} as SimplicityDatabase, {
  get(_target, prop, receiver) {
    instance ??= openDb();
    return Reflect.get(instance as object, prop, receiver);
  },
}) as SimplicityDatabase;

export default db;
