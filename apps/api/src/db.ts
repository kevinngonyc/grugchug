import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// One SQLite file for everything the API keeps. Bun ships the driver, so there
// is nothing to install or run alongside. SQLITE_PATH overrides the location;
// tests pass ":memory:".
//
// Resolves to apps/api/data/grugchug.sqlite from both src/ and dist/, since
// both are one directory deep from apps/api/.
export const DEFAULT_SQLITE_PATH = fileURLToPath(
  new URL("../data/grugchug.sqlite", import.meta.url),
);

// Idempotent: every statement is IF NOT EXISTS, and it runs on every open. A
// shape change is a new column with a default or a new table, not a migration
// framework — this is a study group's data.
export const SCHEMA: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     avatar TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS route_plans (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     plan TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS chat_rooms (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     invite_code TEXT NOT NULL UNIQUE,
     created_by TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS chat_members (
     room_id TEXT NOT NULL,
     user_id TEXT NOT NULL,
     display_name TEXT NOT NULL,
     joined_at TEXT NOT NULL,
     PRIMARY KEY (room_id, user_id)
   )`,
  "CREATE INDEX IF NOT EXISTS chat_members_user ON chat_members (user_id, joined_at DESC)",
  `CREATE TABLE IF NOT EXISTS chat_messages (
     id TEXT PRIMARY KEY,
     room_id TEXT NOT NULL,
     user_id TEXT NOT NULL,
     display_name TEXT NOT NULL,
     body TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  "CREATE INDEX IF NOT EXISTS chat_messages_room ON chat_messages (room_id, created_at DESC, id DESC)",
  `CREATE TABLE IF NOT EXISTS study_sessions (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     plan_id TEXT NOT NULL,
     station_total INTEGER NOT NULL,
     started_at TEXT NOT NULL,
     ended_at TEXT,
     outcome TEXT
   )`,
  "CREATE INDEX IF NOT EXISTS study_sessions_user ON study_sessions (user_id, started_at DESC)",
  `CREATE TABLE IF NOT EXISTS station_results (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     session_id TEXT NOT NULL REFERENCES study_sessions(id),
     station_index INTEGER NOT NULL,
     station_id TEXT NOT NULL,
     passed INTEGER NOT NULL,
     mean_score REAL NOT NULL,
     recorded_at TEXT NOT NULL
   )`,
  "CREATE INDEX IF NOT EXISTS station_results_session ON station_results (session_id)",
];

export function openDatabase(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  for (const statement of SCHEMA) db.run(statement);
  return db;
}

// Bun loads an unset-but-present `SQLITE_PATH=` from .env as "", which would
// otherwise pass `??` and open SQLite's private temporary database — wiped on
// every process restart. Treat empty and whitespace-only as unset too.
export function resolveSqlitePath(env: string | undefined): string {
  const configured = env?.trim();
  return configured ? configured : DEFAULT_SQLITE_PATH;
}

let shared: Database | undefined;

// The process-wide database. Opened on first use so tests never touch disk.
export function getDatabase(): Database {
  if (!shared) shared = openDatabase(resolveSqlitePath(process.env.SQLITE_PATH));
  return shared;
}
