import { describe, expect, test } from "bun:test";
import { DEFAULT_SQLITE_PATH, openDatabase, resolveSqlitePath, SCHEMA } from "./db";

const TABLES = [
  "users",
  "route_plans",
  "chat_rooms",
  "chat_members",
  "chat_messages",
  "study_sessions",
  "station_results",
];

describe("openDatabase", () => {
  test("creates every table the stores rely on", () => {
    const db = openDatabase(":memory:");
    const rows = db
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all();
    const names = rows.map((r) => r.name);
    for (const table of TABLES) expect(names).toContain(table);
    db.close();
  });

  test("applying the schema twice is harmless", () => {
    const db = openDatabase(":memory:");
    for (const statement of SCHEMA) db.run(statement);
    expect(db.query("SELECT COUNT(*) AS n FROM users").get()).toEqual({ n: 0 });
    db.close();
  });

  test("enforces foreign keys", () => {
    const db = openDatabase(":memory:");
    expect(() =>
      db.run(
        `INSERT INTO station_results (session_id, station_index, station_id, passed, mean_score, recorded_at)
         VALUES ('missing', 0, 's', 1, 1.0, '2026-09-12T00:00:00.000Z')`,
      ),
    ).toThrow();
    db.close();
  });
});

describe("resolveSqlitePath", () => {
  test("treats undefined, empty, and whitespace-only as unset", () => {
    expect(resolveSqlitePath(undefined)).toBe(DEFAULT_SQLITE_PATH);
    expect(resolveSqlitePath("")).toBe(DEFAULT_SQLITE_PATH);
    expect(resolveSqlitePath("  ")).toBe(DEFAULT_SQLITE_PATH);
  });

  test("returns the trimmed configured path otherwise", () => {
    expect(resolveSqlitePath("/tmp/x.sqlite")).toBe("/tmp/x.sqlite");
  });
});
