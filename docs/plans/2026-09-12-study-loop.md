# Study Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all API persistence to local SQLite, make the conductor's study session drive and narrate the local train from start through stations and breaks to a remembered ending, feed quiz results into the focus score, and let the people in your chat room ride with their real avatars, stop at their own stations, and show where they are on their route.

**Architecture:** `apps/api/src/db.ts` opens one `bun:sqlite` database and applies an idempotent schema; the users, route-plan, chat, and new study stores are the only SQL. In the web app, `features/conductor` projects its study mode onto the local train's phase (`study-drive.ts`), speaks through `features/speech`'s public `sayLine`/`sayText`, reports quiz means to `features/efficiency`, and posts history to the API. `features/session` reads the study mode and profile and pushes a `journey` event into chat, and maps the roster (now carrying avatar and journey) to companion trains. `features/scene` registers companion motion so every lane can spawn a platform where its train halts.

**Tech Stack:** Bun 1.3 (`bun:sqlite`), TypeScript 6 strict (`verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUncheckedIndexedAccess`), React 19, zustand 5, zod 4, react-three-fiber 9, Biome 2, `bun test` + happy-dom.

**Specs:** `docs/specs/2026-09-12-sqlite-storage-design.md`, `docs/specs/2026-09-12-study-loop-design.md`

## Global Constraints

- Branch `study-loop` in the worktree `.claude/worktrees/conductors`, based on `main` at `0db64f8`. Other sessions share the main working tree; never `git add -A` or `git add .` anywhere. Always add explicit paths.
- Isolated implementers start from `origin/main`: the first command in every agent worktree is `git merge --ff-only study-loop`, then `bun install`.
- All commands run from the repo root unless a step says otherwise. `bun run typecheck`, `bun run test`, `bun run lint`, `bun run build` must pass at the end of every task.
- Kebab-case file names, named exports, no default exports. `import type` for types. No enums, no parameter properties. Guard indexed lookups (`?.`, `??`).
- Biome: double quotes, semicolons, 2-space indent, 100 columns. `bun run fmt` before each commit. If Biome reports `noVoid`, use a block body instead of `void`.
- Web features import each other only through `index.ts`; shared utilities live in `src/lib/`. Anything crossing HTTP is a zod schema in `packages/shared`. `features/scene` never writes the world store; per-frame state lives in refs.
- Tests run offline. API tests open `openDatabase(":memory:")`. Web tests use happy-dom and injected `fetch`.
- Commit messages: imperative subject, wrapped body, ending with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N9ri2hm9heyG387RwYuyVU
```

## Facts about the current code (verified on main 0db64f8)

- `apps/api/src/db.ts` exports `getDb(): Promise<Db>` over `mongodb`. Callers: `index.ts` (`mongoUserRepo(getDb)`), `users-repo.ts`, `conductor/store.ts` (`saveRoutePlan`, `getRoutePlanById`), `chat/store.ts` (`joinRoomByInviteCode`, `findOrCreateRoomForUser`, `setDisplayName`, `findMember`, `listMessages`, `insertMessage`, `DEFAULT_ROOM_NAME`). `routes/chat.ts` and `chat/hub.ts` import those chat functions; `routes/conductor.ts` imports the two plan functions. No test touches Mongo.
- `apps/api/src/index.ts` routes table: health, `/api/users/:id`, conductor plans/answer/evaluate/ask/timer, `/api/chat/room`, `/api/chat/rooms/join`, `/api/chat/rooms/:roomId/messages`, `/api/chat/ws`; `websocket: chatWebSocket`.
- `apps/api/src/chat/hub.ts`: `ChatSocketData` has `efficiency: number`; `newSocketData(input)` sets `efficiency: 0`; `handleFocus` stores and calls `broadcastPresence(roomId)`; roster built from socket data with `{ userId, displayName, efficiency }`.
- `packages/shared/src/schemas/chat.ts`: `chatPresenceMemberSchema = { userId, displayName, efficiency }`; `clientChatEventSchema` union of `send`, `rename`, `focus`. `packages/shared/src/schemas/session.ts` is `sessionSchema { id, userId, startedAt, endedAt }`, re-exported as type `Session` from `apps/web/src/features/session/index.ts` and otherwise unused.
- `apps/web/src/features/conductor/study-session.ts` is a zustand store with modes `idle | counting | on-break | at-station | answering | complete`; it calls `useWorld.getState().setPhase(id, ...)` in `tick`, `chooseKeepStudying`, `submitAllAndFinish` (twice) and `quit`; `startStudying` is called both from the UI and after a passed station. `session-storage.ts` persists `{ planId, stationIndex, mode, timerEndsAt, timerMessage, lastStretchMinutes }`. `conductor-overlay.tsx` runs `hydrate()` once and `tick()` every second. `index.ts` exports `ConductorOverlay`, `useConductorUi`, `useStudySession`.
- `apps/web/src/features/speech`: `say-line.ts` exports `sayLine(id: VoiceLineId)`; `departure.ts` + `use-departure-announcer.ts` announce phase changes; `index.ts` exports `VOICE_LINES`, types, `sayLine`, `useDepartureAnnouncer`, `useSpeechPlayer`.
- `apps/web/src/features/efficiency` exports `useEfficiency` with `report(source, value, { label?, weight?, halfLifeMs?, at? })`.
- `apps/web/src/features/session/party.ts`: `partyTrains(members, selfId)` gives every companion `phase: "running"` and `spriteUrl: spriteForUserId(userId)`. `use-party-trains.ts` calls `syncPartyTrains`. `index.ts` exports `arrivals, MAX_PARTY_TRAINS, PARTY_TRAIN_PREFIX, partyTrainId, partyTrains, spriteForUserId, driveEfficiencyOnce, EFFICIENCY_DRIVE_INTERVAL_MS, useEfficiencyDrive, usePartyTrains` and type `Session`.
- `apps/web/src/features/chat`: `focus-link.ts` (`setFocusSink`, `reportFocus`), `use-chat-room.ts` registers the focus sink on socket open (`setFocusSink((efficiency) => sendEvent({ type: "focus", efficiency }))`) and clears it on close; `roster.ts` (`useRoster`); `chat-panel.tsx` shows `ridersLabel(roster, selfId)` in the header and has no per-member rows; `index.ts` exports `ChatOverlay, reportFocus, useRoster, readIdentity, ...`.
- `apps/web/src/features/profile/index.ts` exports `AVATARS, avatarUrl, profileOwner, useProfile, AvatarPicker`.
- `apps/web/src/features/scene/train.tsx`: companions keep `own = useRef(createMotion())`; per frame `stepMotion(own, cruise, targetSpeed(train), step)` then `closed = drifted - driftClosing(...)`, `own.scroll = lane.scroll + closed`, `body.position.x = closed`. `lane.tsx` spawns stations only when `isLocal`, using the shared `motion` (sets `m.stopTarget`). `motion.ts` exports `registerMotion(id, m)`, `unregisterMotion(id)`, `getMotion(id)`.
- `apps/web/src/routes/session.tsx` creates the local train `phase: "running"`, mounts `useEfficiencyDrive`, `useSpeechPlayer(createVoiceAudio)`, `useDepartureAnnouncer`, `usePartyTrains`, renders `TrainWorld`, dev panel, `FocusHud`, `ChatOverlay`, `ConductorOverlay`. `routes/dashboard.tsx` is a heading only.
- `apps/web/public/characters/` has conductor, bonbon, poku, cat, doug PNGs; `avatarIdSchema` lists all five.

## File structure

```
apps/api/src/
  db.ts                    openDatabase(path), getDatabase(), SCHEMA         (T1)
  db.test.ts                                                                 (T1)
  users-repo.ts            sqliteUserRepo(db, now?)                          (T1)
  routes/users.test.ts     uses sqliteUserRepo(openDatabase(":memory:"))     (T1)
  index.ts                 users wired to SQLite (T1); study routes (T5)
  conductor/store.ts       SQLite plans                                       (T2)
  conductor/store.test.ts                                                    (T2)
  chat/store.ts            SQLite rooms/members/messages                      (T2)
  chat/store.test.ts                                                         (T2)
  package.json             mongodb removed                                   (T2)
  study/store.ts           study sessions + station results                  (T5)
  study/store.test.ts                                                        (T5)
  routes/study-sessions.ts createStudySessionRoutes(db)                      (T5)
  routes/study-sessions.test.ts                                              (T5)
  chat/hub.ts              journey event, avatar/journey on roster            (T7a)
  chat/hub.test.ts         + journey case                                     (T7a)
compose.yaml               deleted                                            (T2)
.env.example               SQLITE_PATH replaces MONGODB_URI                   (T2)

packages/shared/src/schemas/
  journey.ts               journeyStateSchema, journeySchema                  (T3)
  journey.test.ts                                                            (T3)
  chat.ts                  avatar + journey on presence; journey client event (T3)
  session.ts               study session, station result, request schemas    (T3)
  session.test.ts                                                            (T3)
  index.ts                 + journey                                          (T3)

apps/web/src/features/speech/
  say-line.ts              + sayText                                          (T4)
  say-line.test.ts                                                           (T4)
  index.ts                 + sayText (T4); departure exports removed (T8)
  departure.ts, departure.test.ts, use-departure-announcer.ts   deleted      (T8)

apps/web/src/features/conductor/
  study-drive.ts           phaseForMode, journeyForSession, applyStudyPhase, useStudyDrive (T6)
  study-drive.test.ts                                                        (T6)
  history.ts               startHistory, recordHistory, endHistory, fetchHistory (T6)
  history.test.ts                                                            (T6)
  study-session.ts         narration, quiz report, history, no setPhase       (T6)
  study-session.test.ts    extended                                           (T6)
  session-storage.ts       historyId                                         (T6)
  conductor-overlay.tsx    mounts useStudyDrive                               (T6)
  index.ts                 + phaseForMode, journeyForSession (T6); + SessionHistory (T8)
  session-history.tsx      Dashboard list                                     (T8)

apps/web/src/features/chat/
  journey-link.ts          setJourneySink, reportJourney                      (T7a)
  journey-link.test.ts                                                       (T7a)
  use-chat-room.ts         registers the journey sink                         (T7a)
  chat-panel.tsx           roster rows with avatar + journeyLabel             (T7a)
  chat-panel.test.tsx      + journeyLabel cases                               (T7a)
  index.ts                 + reportJourney                                    (T7a)

apps/web/src/features/session/
  party.ts                 avatar + journey → sprite + phase                   (T7b)
  party.test.ts            extended                                           (T7b)
  use-journey-link.ts      pushes { avatar, journey } into chat               (T7b)
  use-journey-link.test.ts                                                   (T7b)
  index.ts                 + useJourneyLink; Session type → StudySession      (T7b)

apps/web/src/features/scene/
  train.tsx                registers companion motion; no drift closing at a platform (T7c)
  lane.tsx                 every lane spawns stations from its own motion     (T7c)

apps/web/src/routes/
  session.tsx              train stopped; useJourneyLink; no announcer        (T8)
  dashboard.tsx            renders SessionHistory                             (T8)

.llm/architecture.md, .llm/AGENTS.md, docs/specs (Deviations)                 (T8)
```

## Waves

- **Wave A (parallel):** T1 db + users, T3 shared schemas, T4 speech `sayText`, T7c scene friend stations.
- **Wave B (parallel, after A):** T2 chat + plan stores, T5 study store + routes, T6 conductor loop, T7a chat presence.
- **Wave C (sequential, after B):** T7b session journey + party mapping, then T8 wiring, dashboard, docs.

---

### Task 1: SQLite database module and users repo

**Files:**
- Rewrite: `apps/api/src/db.ts`
- Create: `apps/api/src/db.test.ts`
- Rewrite: `apps/api/src/users-repo.ts`
- Modify: `apps/api/src/routes/users.test.ts`
- Modify: `apps/api/src/index.ts` (two lines)

**Interfaces:**
- Produces: `openDatabase(path: string): Database`, `getDatabase(): Database`, `SCHEMA: readonly string[]`, `DEFAULT_SQLITE_PATH`; `sqliteUserRepo(db: Database, now?: () => string): UserRepo` (same `UserRepo` interface as today: `get(id)`, `upsert(id, profile)`). `memoryUserRepo` and `mongoUserRepo` are deleted.
- The other stores (Task 2, Task 5) rely on the table names and columns in `SCHEMA` exactly as written below.

- [ ] **Step 1: Write the failing db test**

`apps/api/src/db.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { openDatabase, SCHEMA } from "./db";

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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && bun test src/db.test.ts`
Expected: FAIL, `openDatabase` is not exported (the module still exports `getDb`).

- [ ] **Step 3: Write db.ts**

Replace `apps/api/src/db.ts` with:

```ts
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// One SQLite file for everything the API keeps. Bun ships the driver, so there
// is nothing to install or run alongside. SQLITE_PATH overrides the location;
// tests pass ":memory:".
export const DEFAULT_SQLITE_PATH = fileURLToPath(new URL("../data/grugchug.sqlite", import.meta.url));

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

let shared: Database | undefined;

// The process-wide database. Opened on first use so tests never touch disk.
export function getDatabase(): Database {
  if (!shared) shared = openDatabase(process.env.SQLITE_PATH ?? DEFAULT_SQLITE_PATH);
  return shared;
}
```

- [ ] **Step 4: Run the db test**

Run: `cd apps/api && bun test src/db.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Rewrite users-repo.ts**

```ts
import type { Database } from "bun:sqlite";
import type { User, UserProfile } from "@grugchug/shared";

// Storage behind the users route. One implementation: SQLite, in a file for
// the app and in memory for tests, which exercise the same SQL.
export type UserRepo = {
  get(id: string): Promise<User | null>;
  upsert(id: string, profile: UserProfile): Promise<User>;
};

type UserRow = { id: string; name: string; avatar: User["avatar"]; created_at: string };

function toUser(row: UserRow): User {
  return { id: row.id, name: row.name, avatar: row.avatar, createdAt: row.created_at };
}

// `now` is injectable so tests can pin created_at.
export function sqliteUserRepo(
  db: Database,
  now: () => string = () => new Date().toISOString(),
): UserRepo {
  const select = db.query<UserRow, [string]>(
    "SELECT id, name, avatar, created_at FROM users WHERE id = ?",
  );
  // created_at is written once: the conflict branch leaves it alone.
  const upsert = db.query<UserRow, [string, string, string, string]>(
    `INSERT INTO users (id, name, avatar, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar
     RETURNING id, name, avatar, created_at`,
  );
  return {
    async get(id) {
      const row = select.get(id);
      return row ? toUser(row) : null;
    },
    async upsert(id, profile) {
      const row = upsert.get(id, profile.name, profile.avatar, now());
      if (!row) throw new Error(`upsert of user ${id} returned no row`);
      return toUser(row);
    },
  };
}
```

- [ ] **Step 6: Point the route tests and index.ts at SQLite**

In `apps/api/src/routes/users.test.ts`, replace the imports of `memoryUserRepo` with:

```ts
import { openDatabase } from "../db";
import { sqliteUserRepo } from "../users-repo";
```

and add a helper near the top:

```ts
const repo = (now?: () => string) => sqliteUserRepo(openDatabase(":memory:"), now);
```

Then replace every `memoryUserRepo(...)` call with `repo(...)` (same arguments: none, or a `now` function). The tests' assertions stay as they are; the "second PUT keeps createdAt" test still uses a ticking `now`. Where a test asserts a repo-level read after a 400 (`repo.get(id)`), build the repo once with `const r = repo();` and pass `r` to `createUserRoutes(r)`.

In `apps/api/src/index.ts`, replace

```ts
import { getDb } from "./db";
```
with
```ts
import { getDatabase } from "./db";
```
and
```ts
import { mongoUserRepo } from "./users-repo";
...
const users = createUserRoutes(mongoUserRepo(getDb));
```
with
```ts
import { sqliteUserRepo } from "./users-repo";
...
const users = createUserRoutes(sqliteUserRepo(getDatabase()));
```

`conductor/store.ts` and `chat/store.ts` still import `getDb`; add a temporary shim at the bottom of `db.ts` so the package typechecks until Task 2 replaces them:

```ts
// Removed in Task 2 once the chat and plan stores are on SQLite.
export async function getDb(): Promise<never> {
  throw new Error("MongoDB has been removed; migrate this store to SQLite");
}
```

- [ ] **Step 7: Run api tests, typecheck, lint**

Run: `cd apps/api && bun test && cd ../.. && bun run typecheck && bun run lint`
Expected: pass. `mongodb` is still a dependency (Task 2 removes it).

- [ ] **Step 8: Commit**

```bash
bun run fmt
git add apps/api/src/db.ts apps/api/src/db.test.ts apps/api/src/users-repo.ts \
  apps/api/src/routes/users.test.ts apps/api/src/index.ts
git commit -m "Open one SQLite database and move the users repo onto it

bun:sqlite with an idempotent schema for every table the API keeps.
Users are the first store to move; the route tests now run real SQL in
memory.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N9ri2hm9heyG387RwYuyVU"
```

---

### Task 2: Chat and route-plan stores on SQLite, MongoDB removed

**Files:**
- Rewrite: `apps/api/src/conductor/store.ts`
- Create: `apps/api/src/conductor/store.test.ts`
- Rewrite: `apps/api/src/chat/store.ts`
- Create: `apps/api/src/chat/store.test.ts`
- Modify: `apps/api/src/db.ts` (remove the `getDb` shim)
- Modify: `apps/api/package.json` (remove `mongodb`), `bun.lock` via `bun remove`
- Delete: `compose.yaml`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `getDatabase`, `openDatabase` (Task 1); table names from `SCHEMA`.
- Produces: same exported names and call signatures as today, each with a trailing `db: Database = getDatabase()` parameter: `saveRoutePlan(plan, db?)`, `getRoutePlanById(id, db?)`; `joinRoomByInviteCode(input, db?)`, `findOrCreateRoomForUser(input, db?)`, `setDisplayName(userId, displayName, db?)`, `findMember(roomId, userId, db?)`, `listMessages(roomId, options?, db?)`, `insertMessage(input, db?)`, `DEFAULT_ROOM_NAME`. Callers in `routes/chat.ts`, `chat/hub.ts`, `routes/conductor.ts` do not change.

- [ ] **Step 1: Write the failing plan-store test**

`apps/api/src/conductor/store.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { openDatabase } from "../db";
import { fixtureRoutePlan } from "./fixtures";
import { getRoutePlanById, saveRoutePlan } from "./store";

describe("route plan store", () => {
  test("saves and reads a plan back unchanged", async () => {
    const db = openDatabase(":memory:");
    await saveRoutePlan(fixtureRoutePlan, db);
    expect(await getRoutePlanById(fixtureRoutePlan.id, db)).toEqual(fixtureRoutePlan);
  });

  test("a missing plan is null", async () => {
    const db = openDatabase(":memory:");
    expect(await getRoutePlanById("nope", db)).toBeNull();
  });

  test("a stored document that no longer matches the schema reads as null", async () => {
    const db = openDatabase(":memory:");
    db.run(
      "INSERT INTO route_plans (id, user_id, plan, created_at) VALUES ('old', 'u', '{\"id\":\"old\"}', 'x')",
    );
    expect(await getRoutePlanById("old", db)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && bun test src/conductor/store.test.ts`
Expected: FAIL (the current store calls the `getDb` shim, which throws).

- [ ] **Step 3: Rewrite conductor/store.ts**

```ts
// SQLite persistence for route plans. The plan is stored as JSON; validation
// already happened when it was assembled, and routePlanSchema.safeParse on
// read is a defence against rows written by an older shape.
import type { Database } from "bun:sqlite";
import { type RoutePlan, routePlanSchema } from "@grugchug/shared";
import { getDatabase } from "../db";

export async function saveRoutePlan(plan: RoutePlan, db: Database = getDatabase()): Promise<void> {
  db.query("INSERT INTO route_plans (id, user_id, plan, created_at) VALUES (?, ?, ?, ?)").run(
    plan.id,
    plan.userId,
    JSON.stringify(plan),
    new Date().toISOString(),
  );
}

export async function getRoutePlanById(
  id: string,
  db: Database = getDatabase(),
): Promise<RoutePlan | null> {
  const row = db.query<{ plan: string }, [string]>("SELECT plan FROM route_plans WHERE id = ?").get(id);
  if (!row) return null;
  try {
    const result = routePlanSchema.safeParse(JSON.parse(row.plan));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the plan-store test**

Run: `cd apps/api && bun test src/conductor/store.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing chat-store test**

`apps/api/src/chat/store.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { openDatabase } from "../db";
import {
  DEFAULT_ROOM_NAME,
  findMember,
  findOrCreateRoomForUser,
  insertMessage,
  joinRoomByInviteCode,
  listMessages,
  setDisplayName,
} from "./store";

const ada = { userId: "ada", displayName: "Ada" };
const bob = { userId: "bob", displayName: "Bob" };

describe("chat store", () => {
  test("a first-time visitor gets a fresh room they are a member of", async () => {
    const db = openDatabase(":memory:");
    const { room, member } = await findOrCreateRoomForUser(ada, db);
    expect(room.name).toBe(DEFAULT_ROOM_NAME);
    expect(room.createdBy).toBe("ada");
    expect(room.inviteCode.length).toBeGreaterThan(0);
    expect(member).toMatchObject({ roomId: room.id, userId: "ada", displayName: "Ada" });
    expect(await findMember(room.id, "ada", db)).toEqual(member);
  });

  test("coming back returns the same room and refreshes the display name", async () => {
    const db = openDatabase(":memory:");
    const first = await findOrCreateRoomForUser(ada, db);
    const again = await findOrCreateRoomForUser({ userId: "ada", displayName: "Ada L." }, db);
    expect(again.room.id).toBe(first.room.id);
    expect(again.member.displayName).toBe("Ada L.");
    expect(again.member.joinedAt).toBe(first.member.joinedAt);
  });

  test("joining by invite code enters that room and it becomes your current room", async () => {
    const db = openDatabase(":memory:");
    const adas = await findOrCreateRoomForUser(ada, db);
    const bobs = await findOrCreateRoomForUser(bob, db);
    expect(bobs.room.id).not.toBe(adas.room.id);

    const joined = await joinRoomByInviteCode({ inviteCode: adas.room.inviteCode, ...bob }, db);
    expect(joined?.room.id).toBe(adas.room.id);
    expect(joined?.member.userId).toBe("bob");

    const current = await findOrCreateRoomForUser(bob, db);
    expect(current.room.id).toBe(adas.room.id);
  });

  test("an unknown invite code is null", async () => {
    const db = openDatabase(":memory:");
    expect(await joinRoomByInviteCode({ inviteCode: "nope", ...bob }, db)).toBeNull();
  });

  test("renaming yourself renames every membership", async () => {
    const db = openDatabase(":memory:");
    const adas = await findOrCreateRoomForUser(ada, db);
    const bobs = await findOrCreateRoomForUser(bob, db);
    await joinRoomByInviteCode({ inviteCode: bobs.room.inviteCode, ...ada }, db);
    await setDisplayName("ada", "Countess", db);
    expect((await findMember(adas.room.id, "ada", db))?.displayName).toBe("Countess");
    expect((await findMember(bobs.room.id, "ada", db))?.displayName).toBe("Countess");
  });

  test("messages page backwards without skipping a same-millisecond boundary", async () => {
    const db = openDatabase(":memory:");
    const { room } = await findOrCreateRoomForUser(ada, db);
    const sent = [];
    for (let i = 0; i < 5; i++) {
      sent.push(await insertMessage({ roomId: room.id, ...ada, body: `m${i}` }, db));
    }
    // Force two messages onto the same timestamp so ordering falls to the id.
    db.run("UPDATE chat_messages SET created_at = ? WHERE body IN ('m2', 'm3')", [
      sent[2]?.createdAt ?? "",
    ]);

    const latest = await listMessages(room.id, { limit: 2 }, db);
    expect(latest.map((m) => m.body)).toEqual(["m3", "m4"]);

    const older = await listMessages(room.id, { limit: 2, before: latest[0]?.id }, db);
    expect(older.map((m) => m.body)).toEqual(["m1", "m2"]);

    const oldest = await listMessages(room.id, { limit: 5, before: older[0]?.id }, db);
    expect(oldest.map((m) => m.body)).toEqual(["m0"]);

    expect(await listMessages(room.id, { before: "not-a-message" }, db)).toEqual([]);
  });
});
```

Note: `insertMessage` generates ids with `newId()` from `./ids`; the boundary test relies on ids being monotonically comparable only within the same millisecond after we pin `created_at`, which the `(created_at, id)` ordering handles regardless of id format — the assertion checks that `m2` and `m3` are never both dropped or both repeated across the page boundary. If `newId()` produces ids that sort `m3 < m2`, adjust the expected arrays in the two paged assertions accordingly and note it in the report.

- [ ] **Step 6: Run to verify failure**

Run: `cd apps/api && bun test src/chat/store.test.ts`
Expected: FAIL (the current store still uses Mongo through the shim).

- [ ] **Step 7: Rewrite chat/store.ts**

```ts
// SQLite access for chat. Every function returns shapes from @grugchug/shared,
// and every date is stored as the ISO string the schemas already carry.
import type { Database } from "bun:sqlite";
import type { ChatMember, ChatMessage, ChatRoom } from "@grugchug/shared";
import { MESSAGE_PAGE_SIZE } from "@grugchug/shared";
import { getDatabase } from "../db";
import { newId, newInviteCode } from "./ids";

type RoomRow = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
};

// `joined_at` is when this membership last came in through an invite link, not
// when it first existed. That is deliberate: it is what decides which room a
// browser is in, so following a link you have followed before moves you back.
type MemberRow = { room_id: string; user_id: string; display_name: string; joined_at: string };

type MessageRow = {
  id: string;
  room_id: string;
  user_id: string;
  display_name: string;
  body: string;
  created_at: string;
};

const ROOM_COLUMNS = "id, name, invite_code, created_by, created_at";
const MEMBER_COLUMNS = "room_id, user_id, display_name, joined_at";
const MESSAGE_COLUMNS = "id, room_id, user_id, display_name, body, created_at";

function toRoom(row: RoomRow): ChatRoom {
  return {
    id: row.id,
    name: row.name,
    inviteCode: row.invite_code,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function toMember(row: MemberRow): ChatMember {
  return {
    roomId: row.room_id,
    userId: row.user_id,
    displayName: row.display_name,
    joinedAt: row.joined_at,
  };
}

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    roomId: row.room_id,
    userId: row.user_id,
    displayName: row.display_name,
    body: row.body,
    createdAt: row.created_at,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

function upsertMember(
  db: Database,
  input: {
    roomId: string;
    userId: string;
    displayName: string;
    now: string;
    /** An invite link was followed: make this the room the user is in. */
    entering?: boolean;
  },
): ChatMember {
  // Joining twice is not an error: it re-enters and refreshes the display name.
  const sql = input.entering
    ? `INSERT INTO chat_members (${MEMBER_COLUMNS}) VALUES (?, ?, ?, ?)
       ON CONFLICT(room_id, user_id) DO UPDATE SET
         display_name = excluded.display_name, joined_at = excluded.joined_at
       RETURNING ${MEMBER_COLUMNS}`
    : `INSERT INTO chat_members (${MEMBER_COLUMNS}) VALUES (?, ?, ?, ?)
       ON CONFLICT(room_id, user_id) DO UPDATE SET display_name = excluded.display_name
       RETURNING ${MEMBER_COLUMNS}`;
  const row = db
    .query<MemberRow, [string, string, string, string]>(sql)
    .get(input.roomId, input.userId, input.displayName, input.now);
  if (!row) throw new Error("member upsert returned nothing");
  return toMember(row);
}

// Nothing in the UI shows a room name any more — you are simply in a room, and
// the roster is what tells you whose. The column stays because the schema has
// it and because a future "name your study group" is a one-line change.
export const DEFAULT_ROOM_NAME = "Study room";

function createRoom(
  db: Database,
  input: { name: string; userId: string; displayName: string },
): { room: ChatRoom; member: ChatMember } {
  const now = new Date().toISOString();
  const roomId = newId();
  const insert = db.query<RoomRow, [string, string, string, string, string]>(
    `INSERT INTO chat_rooms (${ROOM_COLUMNS}) VALUES (?, ?, ?, ?, ?) RETURNING ${ROOM_COLUMNS}`,
  );

  // Invite codes are short enough to collide eventually; the unique constraint
  // is the arbiter and we simply draw again.
  let inserted: RoomRow | null = null;
  for (let attempt = 0; attempt < 5 && !inserted; attempt += 1) {
    try {
      inserted = insert.get(roomId, input.name, newInviteCode(), input.userId, now);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  if (!inserted) throw new Error("could not allocate a unique invite code");

  const member = upsertMember(db, {
    roomId,
    userId: input.userId,
    displayName: input.displayName,
    now,
  });
  return { room: toRoom(inserted), member };
}

export async function joinRoomByInviteCode(
  input: { inviteCode: string; userId: string; displayName: string },
  db: Database = getDatabase(),
): Promise<{ room: ChatRoom; member: ChatMember } | null> {
  const row = db
    .query<RoomRow, [string]>(`SELECT ${ROOM_COLUMNS} FROM chat_rooms WHERE invite_code = ?`)
    .get(input.inviteCode);
  if (!row) return null;

  const member = upsertMember(db, {
    roomId: row.id,
    userId: input.userId,
    displayName: input.displayName,
    now: new Date().toISOString(),
    entering: true,
  });
  return { room: toRoom(row), member };
}

/**
 * The one room this browser is in: the most recently joined, or a brand new
 * one for a first-time visitor. Every visit refreshes the display name, so the
 * name field at the top of the chat is the only thing that sets it.
 */
export async function findOrCreateRoomForUser(
  input: { userId: string; displayName: string },
  db: Database = getDatabase(),
): Promise<{ room: ChatRoom; member: ChatMember }> {
  const membership = db
    .query<MemberRow, [string]>(
      `SELECT ${MEMBER_COLUMNS} FROM chat_members WHERE user_id = ? ORDER BY joined_at DESC LIMIT 1`,
    )
    .get(input.userId);

  if (membership) {
    const row = db
      .query<RoomRow, [string]>(`SELECT ${ROOM_COLUMNS} FROM chat_rooms WHERE id = ?`)
      .get(membership.room_id);
    // A membership whose room is gone is not an error: fall through and make
    // a fresh room rather than stranding the user with nowhere to talk.
    if (row) {
      const member = upsertMember(db, {
        roomId: row.id,
        userId: input.userId,
        displayName: input.displayName,
        now: new Date().toISOString(),
      });
      return { room: toRoom(row), member };
    }
  }

  return createRoom(db, { name: DEFAULT_ROOM_NAME, ...input });
}

/** Renaming yourself renames you everywhere you are a member. */
export async function setDisplayName(
  userId: string,
  displayName: string,
  db: Database = getDatabase(),
): Promise<void> {
  db.query("UPDATE chat_members SET display_name = ? WHERE user_id = ?").run(displayName, userId);
}

export async function findMember(
  roomId: string,
  userId: string,
  db: Database = getDatabase(),
): Promise<ChatMember | null> {
  const row = db
    .query<MemberRow, [string, string]>(
      `SELECT ${MEMBER_COLUMNS} FROM chat_members WHERE room_id = ? AND user_id = ?`,
    )
    .get(roomId, userId);
  return row ? toMember(row) : null;
}

export async function listMessages(
  roomId: string,
  options: { before?: string; limit?: number } = {},
  db: Database = getDatabase(),
): Promise<ChatMessage[]> {
  const limit = Math.min(Math.max(options.limit ?? MESSAGE_PAGE_SIZE, 1), 200);

  // Paging by (created_at, id) rather than by timestamp alone, so messages
  // that land in the same millisecond are never skipped at a page boundary.
  let rows: MessageRow[];
  if (options.before) {
    const anchor = db
      .query<{ created_at: string; id: string }, [string, string]>(
        "SELECT created_at, id FROM chat_messages WHERE id = ? AND room_id = ?",
      )
      .get(options.before, roomId);
    if (!anchor) return [];
    rows = db
      .query<MessageRow, [string, string, string, string, number]>(
        `SELECT ${MESSAGE_COLUMNS} FROM chat_messages
         WHERE room_id = ? AND (created_at < ? OR (created_at = ? AND id < ?))
         ORDER BY created_at DESC, id DESC LIMIT ?`,
      )
      .all(roomId, anchor.created_at, anchor.created_at, anchor.id, limit);
  } else {
    rows = db
      .query<MessageRow, [string, number]>(
        `SELECT ${MESSAGE_COLUMNS} FROM chat_messages WHERE room_id = ?
         ORDER BY created_at DESC, id DESC LIMIT ?`,
      )
      .all(roomId, limit);
  }
  return rows.reverse().map(toMessage);
}

export async function insertMessage(
  input: { roomId: string; userId: string; displayName: string; body: string },
  db: Database = getDatabase(),
): Promise<ChatMessage> {
  const row: MessageRow = {
    id: newId(),
    room_id: input.roomId,
    user_id: input.userId,
    display_name: input.displayName,
    body: input.body,
    created_at: new Date().toISOString(),
  };
  db.query(`INSERT INTO chat_messages (${MESSAGE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`).run(
    row.id,
    row.room_id,
    row.user_id,
    row.display_name,
    row.body,
    row.created_at,
  );
  return toMessage(row);
}
```

- [ ] **Step 8: Run the chat-store test**

Run: `cd apps/api && bun test src/chat/store.test.ts`
Expected: PASS, 6 tests. If the boundary test's expected order differs because of how `newId()` sorts, fix the expectation per the note in Step 5 and record it in the report.

- [ ] **Step 9: Remove MongoDB**

- Delete the `getDb` shim from `apps/api/src/db.ts`.
- Run `cd apps/api && bun remove mongodb` (updates `package.json` and the root `bun.lock`).
- Delete `compose.yaml` (`git rm compose.yaml`).
- In `.env.example`, replace the `MONGODB_URI=...` line with:

```
# SQLite file for everything the API stores. Defaults to apps/api/data/grugchug.sqlite.
SQLITE_PATH=
```

- `grep -rn "getDb\|mongodb\|MONGODB" apps packages --include=*.ts --include=*.json` must return nothing outside `bun.lock` history.

- [ ] **Step 10: Full chain**

Run: `bun run typecheck && bun run test && bun run lint && bun run build`
Expected: pass. Optional smoke: `cd apps/api && bun run dev`, then `curl -s -X PUT localhost:3000/api/users/smoke -H 'content-type: application/json' -d '{"name":"You","avatar":"poku"}'` returns the user and `apps/api/data/grugchug.sqlite` now exists. Stop the server.

- [ ] **Step 11: Commit**

```bash
bun run fmt
git add apps/api/src/conductor/store.ts apps/api/src/conductor/store.test.ts \
  apps/api/src/chat/store.ts apps/api/src/chat/store.test.ts apps/api/src/db.ts \
  apps/api/package.json bun.lock .env.example
git rm -q compose.yaml
git commit -m "Move chat and route plans to SQLite and drop MongoDB

Same store functions, real SQL, tested in memory. compose.yaml and the
mongodb driver go with it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N9ri2hm9heyG387RwYuyVU"
```

---

### Task 3: Shared schemas: journey, presence, study sessions

**Files:**
- Create: `packages/shared/src/schemas/journey.ts`, `journey.test.ts`
- Modify: `packages/shared/src/schemas/chat.ts`, `chat.test.ts`
- Rewrite: `packages/shared/src/schemas/session.ts`; create `session.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `journeyStateSchema`, `JourneyState = "idle" | "studying" | "at-station" | "answering" | "on-break" | "finished"`, `journeySchema`, `Journey = { state: JourneyState; station: { index: number; total: number } | null }`; `chatPresenceMemberSchema` gains `avatar: avatarIdSchema.optional()` and `journey: journeySchema.optional()`; `clientChatEventSchema` gains `{ type: "journey"; avatar: AvatarId; journey: Journey }`; `studyOutcomeSchema` (`completed | quit`), `studySessionSchema`, `StudySession`, `stationResultSchema`, `StationResult`, `studySessionSummarySchema`, `StudySessionSummary`, `startStudySessionRequestSchema`, `StartStudySessionRequest`, `stationResultRequestSchema`, `StationResultRequest`, `endStudySessionRequestSchema`, `EndStudySessionRequest`. The old `sessionSchema`/`Session` are removed; the only consumer (`apps/web/src/features/session/index.ts`, type re-export) is updated in Task 7b — until then it still typechecks because Task 3 keeps a deprecated alias `export type Session = StudySession;` that Task 7b deletes.

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/schemas/journey.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { journeySchema, journeyStateSchema } from "./journey";

describe("journeySchema", () => {
  test("accepts a rider at a station", () => {
    const journey = { state: "at-station", station: { index: 2, total: 6 } };
    expect(journeySchema.parse(journey)).toEqual(journey);
  });

  test("accepts an idle rider with no station", () => {
    expect(journeySchema.parse({ state: "idle", station: null })).toEqual({
      state: "idle",
      station: null,
    });
  });

  test("rejects a station index of zero", () => {
    expect(
      journeySchema.safeParse({ state: "studying", station: { index: 0, total: 6 } }).success,
    ).toBe(false);
  });

  test("lists every state the loop can be in", () => {
    expect([...journeyStateSchema.options].sort()).toEqual(
      ["answering", "at-station", "finished", "idle", "on-break", "studying"].sort(),
    );
  });
});
```

`packages/shared/src/schemas/session.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  endStudySessionRequestSchema,
  startStudySessionRequestSchema,
  stationResultRequestSchema,
  studySessionSchema,
  studySessionSummarySchema,
} from "./session";

const session = {
  id: "s1",
  userId: "u1",
  planId: "p1",
  stationTotal: 4,
  startedAt: "2026-09-12T10:00:00.000Z",
  endedAt: null,
  outcome: null,
};

describe("study session schemas", () => {
  test("accepts an open session", () => {
    expect(studySessionSchema.parse(session)).toEqual(session);
  });

  test("accepts a completed summary", () => {
    const summary = {
      ...session,
      endedAt: "2026-09-12T10:40:00.000Z",
      outcome: "completed",
      stationsPassed: 4,
    };
    expect(studySessionSummarySchema.parse(summary)).toEqual(summary);
  });

  test("rejects an unknown outcome", () => {
    expect(endStudySessionRequestSchema.safeParse({ outcome: "abandoned" }).success).toBe(false);
  });

  test("start needs a positive station total", () => {
    expect(
      startStudySessionRequestSchema.safeParse({ userId: "u", planId: "p", stationTotal: 0 })
        .success,
    ).toBe(false);
  });

  test("a station result keeps the score in 0..1", () => {
    const ok = { stationIndex: 0, stationId: "st", passed: true, meanScore: 0.75 };
    expect(stationResultRequestSchema.parse(ok)).toEqual(ok);
    expect(stationResultRequestSchema.safeParse({ ...ok, meanScore: 1.5 }).success).toBe(false);
  });
});
```

Add to `packages/shared/src/schemas/chat.test.ts` (inside its existing describe blocks or a new one):

```ts
describe("presence with a journey", () => {
  test("a member may carry an avatar and where they are", () => {
    const member = {
      userId: "u1",
      displayName: "Ada",
      efficiency: 0.5,
      avatar: "cat",
      journey: { state: "on-break", station: { index: 3, total: 5 } },
    };
    expect(chatPresenceMemberSchema.parse(member)).toEqual(member);
  });

  test("a member without them still parses", () => {
    const member = { userId: "u1", displayName: "Ada", efficiency: 0.5 };
    expect(chatPresenceMemberSchema.parse(member)).toEqual(member);
  });

  test("the journey client event carries avatar and journey", () => {
    const event = {
      type: "journey",
      avatar: "doug",
      journey: { state: "studying", station: { index: 1, total: 2 } },
    };
    expect(clientChatEventSchema.parse(event)).toEqual(event);
  });
});
```

(Import `chatPresenceMemberSchema` and `clientChatEventSchema` from `./chat` if the file does not already.)

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/shared && bun test`
Expected: FAIL: `./journey` missing; the session schema exports missing; presence parse strips `avatar`/`journey`.

- [ ] **Step 3: Write journey.ts**

```ts
import { z } from "zod";

// Where a rider is on their route, as the room sees it. Mirrors the conductor's
// study-session modes without naming them: idle has no plan or has not started;
// studying is the timer running; at-station, answering and on-break are the
// three things you do at a platform; finished is the terminus.
export const journeyStateSchema = z.enum([
  "idle",
  "studying",
  "at-station",
  "answering",
  "on-break",
  "finished",
]);
export type JourneyState = z.infer<typeof journeyStateSchema>;

// `station` is 1-based for display ("Station 2 of 6") and null when there is
// no plan.
export const journeySchema = z.object({
  state: journeyStateSchema,
  station: z
    .object({ index: z.number().int().positive(), total: z.number().int().positive() })
    .nullable(),
});
export type Journey = z.infer<typeof journeySchema>;
```

- [ ] **Step 4: Extend chat.ts**

Add imports at the top of `packages/shared/src/schemas/chat.ts`:

```ts
import { journeySchema } from "./journey";
import { avatarIdSchema } from "./user";
```

In `chatPresenceMemberSchema`, add after `efficiency`:

```ts
  // The rider's picked character and where they are on their route. Optional
  // on the wire so an older client that never sends them still parses.
  avatar: avatarIdSchema.optional(),
  journey: journeySchema.optional(),
```

In `clientChatEventSchema`, add a fourth member after `focus`:

```ts
  // Where you are on your route and what you look like, so the room can draw
  // your train stopping at a station with your own avatar in the cart.
  z.object({
    type: z.literal("journey"),
    avatar: avatarIdSchema,
    journey: journeySchema,
  }),
```

- [ ] **Step 5: Rewrite session.ts**

```ts
import { z } from "zod";

// One run through a route: from Start studying to complete or quit. Recorded
// as it happens by the web app; the plan is not copied, only referenced.
export const studyOutcomeSchema = z.enum(["completed", "quit"]);
export type StudyOutcome = z.infer<typeof studyOutcomeSchema>;

export const studySessionSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  planId: z.string().min(1),
  stationTotal: z.number().int().positive(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  outcome: studyOutcomeSchema.nullable(),
});
export type StudySession = z.infer<typeof studySessionSchema>;

// One attempt at one station's questions. A station may be attempted more
// than once; "passed" for a session means the latest attempt passed.
export const stationResultSchema = z.object({
  sessionId: z.string().min(1),
  stationIndex: z.number().int().nonnegative(),
  stationId: z.string().min(1),
  passed: z.boolean(),
  meanScore: z.number().min(0).max(1),
  recordedAt: z.iso.datetime(),
});
export type StationResult = z.infer<typeof stationResultSchema>;

export const studySessionSummarySchema = studySessionSchema.extend({
  stationsPassed: z.number().int().nonnegative(),
});
export type StudySessionSummary = z.infer<typeof studySessionSummarySchema>;

// POST /api/study-sessions
export const startStudySessionRequestSchema = z.object({
  userId: z.string().min(1),
  planId: z.string().min(1),
  stationTotal: z.number().int().positive(),
});
export type StartStudySessionRequest = z.infer<typeof startStudySessionRequestSchema>;

// POST /api/study-sessions/:id/stations
export const stationResultRequestSchema = stationResultSchema.pick({
  stationIndex: true,
  stationId: true,
  passed: true,
  meanScore: true,
});
export type StationResultRequest = z.infer<typeof stationResultRequestSchema>;

// POST /api/study-sessions/:id/end
export const endStudySessionRequestSchema = z.object({ outcome: studyOutcomeSchema });
export type EndStudySessionRequest = z.infer<typeof endStudySessionRequestSchema>;

/** @deprecated The old sitting record; removed once features/session stops re-exporting it. */
export type Session = StudySession;
```

Add `export * from "./schemas/journey";` to `packages/shared/src/index.ts` in alphabetical position (after `gaze`).

- [ ] **Step 6: Run shared tests, typecheck, lint**

Run: `cd packages/shared && bun test && cd ../.. && bun run typecheck && bun run lint`
Expected: pass. (`apps/web`'s `Session` re-export still resolves through the alias.)

- [ ] **Step 7: Commit**

```bash
bun run fmt
git add packages/shared/src/schemas/journey.ts packages/shared/src/schemas/journey.test.ts \
  packages/shared/src/schemas/chat.ts packages/shared/src/schemas/chat.test.ts \
  packages/shared/src/schemas/session.ts packages/shared/src/schemas/session.test.ts \
  packages/shared/src/index.ts
git commit -m "Add journey, presence avatar, and study-session schemas

Presence may carry a rider's avatar and where they are on their route;
study sessions and station results are the shapes history records.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N9ri2hm9heyG387RwYuyVU"
```

---

### Task 4: `sayText`, and clips only for your own conductor

**Files:**
- Modify: `apps/web/src/features/speech/say-line.ts`, `say-line.test.ts`, `index.ts`
- Modify: `apps/web/src/features/speech/player.ts`, `player.test.ts`

**Interfaces:**
- Produces: `sayText(text: string): void` — the local conductor says `text` with no clip (the player's text-length fallback times it). Exported from `@/features/speech`.
- Behaviour change: the speech player plays a clip only when the speaking train is the local train (`useWorld.getState().localTrainId`). Any other train's line, clip or not, is timed by `speechDuration(text)` and shows as a bubble only. The user asked that conductor voice lines play only for you.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/features/speech/say-line.test.ts` inside a new describe (reuse the file's `local` fixture and `speechOf` helper):

```ts
describe("sayText", () => {
  test("has the local conductor say a plain line with no clip", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.setLocalTrainId("local");
    sayText("Now arriving: Photosynthesis");
    expect(speechOf("local")?.text).toBe("Now arriving: Photosynthesis");
    expect(speechOf("local")?.audioUrl).toBeUndefined();
  });

  test("does nothing when there is no local train", () => {
    sayText("hello?");
    expect(useWorld.getState().trains).toEqual({});
  });
});
```

Import `sayText` alongside `sayLine`.

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && bun test src/features/speech/say-line.test.ts`
Expected: FAIL, `sayText` is not exported.

- [ ] **Step 3: Implement**

Add to `apps/web/src/features/speech/say-line.ts`:

```ts
// A line with no recording: a bubble timed by its length. For moments the
// conductor should mark but nobody recorded, such as naming the next station.
export function sayText(text: string): void {
  const { localTrainId, say } = useWorld.getState();
  if (localTrainId === null) return;
  say(localTrainId, text);
}
```

In `index.ts` change the say-line export to `export { sayLine, sayText } from "./say-line";` and mention `sayText` in the header comment.

- [ ] **Step 4: Failing player test: a friend's clip does not play**

Add to `player.test.ts`, inside the existing `describe("createSpeechPlayer")` (the file already has `local`, `friend`, `setup`, `speechOf`):

```ts
  test("plays clips only for the local train; a friend's line is timed like text", () => {
    const { audios, timers, player } = setup();
    useWorld.getState().addTrain(friend);
    useWorld.getState().setLocalTrainId("local");
    player.start();
    useWorld.getState().say("friend", "Hello there", "/voices/f.mp3");
    expect(audios).toHaveLength(0);
    expect(timers.pending).toHaveLength(1);
    expect(timers.pending[0]?.ms).toBe(speechDuration("Hello there"));
    timers.runAll();
    expect(speechOf("friend")).toBeUndefined();
  });
```

Check the file's existing "does not replay an utterance it has already seen" test: it currently fires `ended` on a friend's clip. With this change no audio is created for a friend, so rewrite that test to use the local train (say on `"local"` after `setLocalTrainId("local")`, fire `ended`, then re-deliver via `applySnapshot` with a friend that carries the same speech, and assert no audio and no new timer are created for the seen id).

Run: `cd apps/web && bun test src/features/speech/player.test.ts`
Expected: the new test FAILS (an audio is created for the friend).

- [ ] **Step 5: Player change**

In `player.ts`'s `play(trainId, speech)`, replace the clip branch condition so the text timer is used whenever there is no clip or the train is not local:

```ts
    // Only your own conductor is heard. Friends' lines are seen as bubbles,
    // timed by their text, so a room of trains is not a room of voices.
    const isLocal = useWorld.getState().localTrainId === trainId;
    if (speech.audioUrl === undefined || !isLocal) {
      entry.timer = startTimer(trainId, speech);
      return;
    }
```

Update the header comment in `player.ts` and the "Friends' clips play locally too" sentence wherever it appears in `features/speech` comments (grep `friends`). Run the speech tests again; expected PASS.

- [ ] **Step 6: Verify and commit**

Run: `cd apps/web && bun test src/features/speech && cd ../.. && bun run typecheck && bun run lint`
Expected: pass.

```bash
bun run fmt
git add apps/web/src/features/speech/say-line.ts apps/web/src/features/speech/say-line.test.ts \
  apps/web/src/features/speech/index.ts apps/web/src/features/speech/player.ts \
  apps/web/src/features/speech/player.test.ts
git commit -m "Add sayText and play voice clips only for your own conductor

Friends' lines still show as bubbles, timed by their text.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N9ri2hm9heyG387RwYuyVU"
```

---

### Task 5: Study history store and routes

**Files:**
- Create: `apps/api/src/study/store.ts`, `store.test.ts`
- Create: `apps/api/src/routes/study-sessions.ts`, `study-sessions.test.ts`
- Modify: `apps/api/src/index.ts`

**Interfaces:**
- Consumes: `openDatabase`/`getDatabase` (T1); the session schemas (T3).
- Produces: `startStudySession(input, db?)`, `recordStationResult(sessionId, input, db?)` (null when the session does not exist), `endStudySession(sessionId, outcome, db?)` (null when missing), `listStudySessions(userId, db?, limit = 20)`; `createStudySessionRoutes(db)` → `{ create(req), record(id, req), end(id, req), list(req) }`. HTTP as in the spec.

- [ ] **Step 1: Write the failing store test**

`apps/api/src/study/store.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { openDatabase } from "../db";
import { endStudySession, listStudySessions, recordStationResult, startStudySession } from "./store";

const start = { userId: "u1", planId: "p1", stationTotal: 3 };

describe("study store", () => {
  test("starts an open session", async () => {
    const db = openDatabase(":memory:");
    const session = await startStudySession(start, db);
    expect(session).toMatchObject({ ...start, endedAt: null, outcome: null });
    expect(session.id.length).toBeGreaterThan(0);
  });

  test("records attempts and counts only the latest per station as passed", async () => {
    const db = openDatabase(":memory:");
    const session = await startStudySession(start, db);
    const first = await recordStationResult(
      session.id,
      { stationIndex: 0, stationId: "a", passed: false, meanScore: 0.3 },
      db,
    );
    expect(first).toMatchObject({ sessionId: session.id, stationIndex: 0, passed: false });
    await recordStationResult(
      session.id,
      { stationIndex: 0, stationId: "a", passed: true, meanScore: 0.9 },
      db,
    );
    await recordStationResult(
      session.id,
      { stationIndex: 1, stationId: "b", passed: true, meanScore: 0.8 },
      db,
    );
    // Station 1 passed, then a later attempt failed: latest wins.
    await recordStationResult(
      session.id,
      { stationIndex: 1, stationId: "b", passed: false, meanScore: 0.2 },
      db,
    );
    const [summary] = await listStudySessions("u1", db);
    expect(summary?.stationsPassed).toBe(1);
  });

  test("ending sets the outcome and time", async () => {
    const db = openDatabase(":memory:");
    const session = await startStudySession(start, db);
    const ended = await endStudySession(session.id, "completed", db);
    expect(ended?.outcome).toBe("completed");
    expect(ended?.endedAt).not.toBeNull();
  });

  test("unknown sessions are null", async () => {
    const db = openDatabase(":memory:");
    expect(
      await recordStationResult(
        "nope",
        { stationIndex: 0, stationId: "a", passed: true, meanScore: 1 },
        db,
      ),
    ).toBeNull();
    expect(await endStudySession("nope", "quit", db)).toBeNull();
  });

  test("lists a user's sessions newest first, others excluded", async () => {
    const db = openDatabase(":memory:");
    const older = await startStudySession(start, db);
    await new Promise((r) => setTimeout(r, 2));
    const newer = await startStudySession(start, db);
    await startStudySession({ ...start, userId: "u2" }, db);
    const list = await listStudySessions("u1", db);
    expect(list.map((s) => s.id)).toEqual([newer.id, older.id]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && bun test src/study/store.test.ts`
Expected: FAIL, cannot find module `./store`.

- [ ] **Step 3: Write study/store.ts**

```ts
// SQLite persistence for study history: one row per run through a route, one
// row per attempt at a station. Shapes come from @grugchug/shared.
import type { Database } from "bun:sqlite";
import type {
  StartStudySessionRequest,
  StationResult,
  StationResultRequest,
  StudyOutcome,
  StudySession,
  StudySessionSummary,
} from "@grugchug/shared";
import { getDatabase } from "../db";

type SessionRow = {
  id: string;
  user_id: string;
  plan_id: string;
  station_total: number;
  started_at: string;
  ended_at: string | null;
  outcome: StudyOutcome | null;
};

type ResultRow = {
  session_id: string;
  station_index: number;
  station_id: string;
  passed: number;
  mean_score: number;
  recorded_at: string;
};

const SESSION_COLUMNS = "id, user_id, plan_id, station_total, started_at, ended_at, outcome";

function toSession(row: SessionRow): StudySession {
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    stationTotal: row.station_total,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    outcome: row.outcome,
  };
}

function toResult(row: ResultRow): StationResult {
  return {
    sessionId: row.session_id,
    stationIndex: row.station_index,
    stationId: row.station_id,
    passed: row.passed === 1,
    meanScore: row.mean_score,
    recordedAt: row.recorded_at,
  };
}

export async function startStudySession(
  input: StartStudySessionRequest,
  db: Database = getDatabase(),
): Promise<StudySession> {
  const row = db
    .query<SessionRow, [string, string, string, number, string]>(
      `INSERT INTO study_sessions (${SESSION_COLUMNS}) VALUES (?, ?, ?, ?, ?, NULL, NULL)
       RETURNING ${SESSION_COLUMNS}`,
    )
    .get(crypto.randomUUID(), input.userId, input.planId, input.stationTotal, new Date().toISOString());
  if (!row) throw new Error("study session insert returned no row");
  return toSession(row);
}

export async function recordStationResult(
  sessionId: string,
  input: StationResultRequest,
  db: Database = getDatabase(),
): Promise<StationResult | null> {
  const exists = db.query<{ id: string }, [string]>("SELECT id FROM study_sessions WHERE id = ?").get(sessionId);
  if (!exists) return null;
  const row = db
    .query<ResultRow, [string, number, string, number, number, string]>(
      `INSERT INTO station_results (session_id, station_index, station_id, passed, mean_score, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING session_id, station_index, station_id, passed, mean_score, recorded_at`,
    )
    .get(sessionId, input.stationIndex, input.stationId, input.passed ? 1 : 0, input.meanScore, new Date().toISOString());
  if (!row) throw new Error("station result insert returned no row");
  return toResult(row);
}

export async function endStudySession(
  sessionId: string,
  outcome: StudyOutcome,
  db: Database = getDatabase(),
): Promise<StudySession | null> {
  const row = db
    .query<SessionRow, [string, string, string]>(
      `UPDATE study_sessions SET ended_at = ?, outcome = ? WHERE id = ? RETURNING ${SESSION_COLUMNS}`,
    )
    .get(new Date().toISOString(), outcome, sessionId);
  return row ? toSession(row) : null;
}

// stationsPassed counts stations whose most recent attempt passed.
export async function listStudySessions(
  userId: string,
  db: Database = getDatabase(),
  limit = 20,
): Promise<StudySessionSummary[]> {
  const rows = db
    .query<SessionRow & { stations_passed: number }, [string, number]>(
      `SELECT s.id, s.user_id, s.plan_id, s.station_total, s.started_at, s.ended_at, s.outcome,
              (SELECT COUNT(*) FROM station_results r
                WHERE r.session_id = s.id AND r.passed = 1
                  AND r.id = (SELECT MAX(r2.id) FROM station_results r2
                              WHERE r2.session_id = r.session_id
                                AND r2.station_index = r.station_index)) AS stations_passed
       FROM study_sessions s
       WHERE s.user_id = ?
       ORDER BY s.started_at DESC, s.id DESC
       LIMIT ?`,
    )
    .all(userId, limit);
  return rows.map((row) => ({ ...toSession(row), stationsPassed: row.stations_passed }));
}
```

- [ ] **Step 4: Run the store test**

Run: `cd apps/api && bun test src/study/store.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing route tests**

`apps/api/src/routes/study-sessions.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { openDatabase } from "../db";
import { createStudySessionRoutes } from "./study-sessions";

const json = (body: unknown, method = "POST") =>
  new Request("http://test/api/study-sessions", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const start = { userId: "u1", planId: "p1", stationTotal: 2 };

describe("study session routes", () => {
  test("start, record, end, list", async () => {
    const routes = createStudySessionRoutes(openDatabase(":memory:"));
    const created = await routes.create(json(start));
    expect(created.status).toBe(200);
    const session = (await created.json()) as { id: string };

    const recorded = await routes.record(
      session.id,
      json({ stationIndex: 0, stationId: "a", passed: true, meanScore: 0.9 }),
    );
    expect(recorded.status).toBe(200);

    const ended = await routes.end(session.id, json({ outcome: "completed" }));
    expect(ended.status).toBe(200);
    expect(await ended.json()).toMatchObject({ id: session.id, outcome: "completed" });

    const listed = await routes.list(new Request("http://test/api/study-sessions?userId=u1"));
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject([{ id: session.id, stationsPassed: 1 }]);
  });

  test("bad bodies are 400 and unknown sessions are 404", async () => {
    const routes = createStudySessionRoutes(openDatabase(":memory:"));
    expect((await routes.create(json({ userId: "u1" }))).status).toBe(400);
    expect(
      (await routes.record("nope", json({ stationIndex: 0, stationId: "a", passed: true, meanScore: 1 })))
        .status,
    ).toBe(404);
    expect((await routes.end("nope", json({ outcome: "quit" }))).status).toBe(404);
    expect((await routes.list(new Request("http://test/api/study-sessions"))).status).toBe(400);
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `cd apps/api && bun test src/routes/study-sessions.test.ts`
Expected: FAIL, cannot find module `./study-sessions`.

- [ ] **Step 7: Write routes/study-sessions.ts**

```ts
// Study history: start a run through a route, record each station's verdict,
// end it, and list a user's runs for the dashboard. Handlers take ids directly
// so tests need no BunRequest; index.ts unpacks req.params.
import type { Database } from "bun:sqlite";
import {
  endStudySessionRequestSchema,
  startStudySessionRequestSchema,
  stationResultRequestSchema,
  userIdSchema,
} from "@grugchug/shared";
import type { z } from "zod";
import {
  endStudySession,
  listStudySessions,
  recordStationResult,
  startStudySession,
} from "../study/store";

function problem(status: number, error: string, detail?: string): Response {
  return Response.json({ error, ...(detail === undefined ? {} : { detail }) }, { status });
}

async function readBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ ok: true; data: z.output<S> } | { ok: false; response: Response }> {
  const body: unknown = await req.json().catch(() => undefined);
  if (body === undefined) return { ok: false, response: problem(400, "invalid body", "body must be JSON") };
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, response: problem(400, "invalid body", parsed.error.issues[0]?.message) };
  }
  return { ok: true, data: parsed.data };
}

export function createStudySessionRoutes(db: Database) {
  return {
    async create(req: Request): Promise<Response> {
      const body = await readBody(req, startStudySessionRequestSchema);
      if (!body.ok) return body.response;
      return Response.json(await startStudySession(body.data, db));
    },

    async record(id: string, req: Request): Promise<Response> {
      const body = await readBody(req, stationResultRequestSchema);
      if (!body.ok) return body.response;
      const result = await recordStationResult(id, body.data, db);
      return result ? Response.json(result) : problem(404, "study session not found");
    },

    async end(id: string, req: Request): Promise<Response> {
      const body = await readBody(req, endStudySessionRequestSchema);
      if (!body.ok) return body.response;
      const session = await endStudySession(id, body.data.outcome, db);
      return session ? Response.json(session) : problem(404, "study session not found");
    },

    async list(req: Request): Promise<Response> {
      const userId = userIdSchema.safeParse(new URL(req.url).searchParams.get("userId") ?? "");
      if (!userId.success) return problem(400, "invalid user id", "userId query parameter required");
      return Response.json(await listStudySessions(userId.data, db));
    },
  };
}
```

- [ ] **Step 8: Mount the routes**

In `apps/api/src/index.ts` add the import `import { createStudySessionRoutes } from "./routes/study-sessions";`, then after the `users` const:

```ts
const study = createStudySessionRoutes(getDatabase());
```

and in the routes table, after the `/api/users/:id` entry:

```ts
    "/api/study-sessions": {
      POST: (req) => study.create(req),
      GET: (req) => study.list(req),
    },
    "/api/study-sessions/:id/stations": { POST: (req) => study.record(req.params.id, req) },
    "/api/study-sessions/:id/end": { POST: (req) => study.end(req.params.id, req) },
```

- [ ] **Step 9: Verify and commit**

Run: `cd apps/api && bun test && cd ../.. && bun run typecheck && bun run lint && bun run build`
Expected: pass.

```bash
bun run fmt
git add apps/api/src/study/store.ts apps/api/src/study/store.test.ts \
  apps/api/src/routes/study-sessions.ts apps/api/src/routes/study-sessions.test.ts apps/api/src/index.ts
git commit -m "Record study sessions and station verdicts

Start, station result, end, and a per-user list with the latest
attempt per station deciding what counts as passed.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N9ri2hm9heyG387RwYuyVU"
```

---

### Task 6: The study session drives and narrates the train

**Files:**
- Create: `apps/web/src/features/conductor/study-drive.ts`, `study-drive.test.ts`
- Create: `apps/web/src/features/conductor/history.ts`, `history.test.ts`
- Modify: `apps/web/src/features/conductor/study-session.ts`, `study-session.test.ts`
- Modify: `apps/web/src/features/conductor/session-storage.ts`
- Modify: `apps/web/src/features/conductor/conductor-overlay.tsx`
- Modify: `apps/web/src/features/conductor/index.ts`

**Interfaces:**
- Consumes: `sayLine`, `sayText` from `@/features/speech` (T4); `useEfficiency` from `@/features/efficiency`; `useWorld` (`setPhase`, `localTrainId`, `trains`); the study-session request schemas from `@grugchug/shared` (T3); `getUserId` from `@/lib/user-id`.
- Produces: `phaseForMode(mode: SessionMode): TrainPhase`; `journeyForSession(s: { mode: SessionMode; stationIndex: number; plan: { stations: unknown[] } | null }): Journey`; `applyStudyPhase(): void`; `useStudyDrive(): void`; `startHistory(body, fetchFn?): Promise<string | null>`, `recordHistory(sessionId | null, body, fetchFn?): Promise<void>`, `endHistory(sessionId | null, outcome, fetchFn?): Promise<void>`, `fetchHistory(userId, fetchFn?): Promise<StudySessionSummary[]>`, `HISTORY_TIMEOUT_MS = 3000`. `index.ts` additionally exports `journeyForSession`, `phaseForMode`, `useStudyDrive`, `fetchHistory`. `StudySessionState` gains `historyId: string | null`; `PersistedSession` gains `historyId`.

Read `apps/web/src/features/conductor/study-session.test.ts` first to see how the existing tests mock `./api` (Bun `mock.module` or injected functions) and follow the same technique for the new assertions.

- [ ] **Step 1: Write the failing study-drive tests**

`apps/web/src/features/conductor/study-drive.test.ts`:

```ts
import { beforeEach, describe, expect, test } from "bun:test";
import type { TrainState } from "@grugchug/shared";
import { useWorld } from "@/features/world";
import { applyStudyPhase, journeyForSession, phaseForMode } from "./study-drive";
import { useStudySession } from "./study-session";

const local: TrainState = {
  id: "local",
  owner: { name: "You", spriteUrl: "/characters/poku.png" },
  phase: "running",
  efficiency: 0.5,
  lane: 0,
};

const plan = { stations: [{}, {}, {}] } as never;

beforeEach(() => {
  useWorld.setState({ trains: {}, localTrainId: null });
  useStudySession.setState({ mode: "idle", stationIndex: 0, plan: null });
});

describe("phaseForMode", () => {
  test("only counting runs; complete is the terminus; the rest wait at a platform", () => {
    expect(phaseForMode("counting")).toBe("running");
    expect(phaseForMode("complete")).toBe("finished");
    for (const mode of ["idle", "at-station", "answering", "on-break"] as const) {
      expect(phaseForMode(mode)).toBe("stopped");
    }
  });
});

describe("journeyForSession", () => {
  test("maps modes and reports a 1-based station", () => {
    expect(journeyForSession({ mode: "idle", stationIndex: 0, plan: null })).toEqual({
      state: "idle",
      station: null,
    });
    expect(journeyForSession({ mode: "counting", stationIndex: 1, plan })).toEqual({
      state: "studying",
      station: { index: 2, total: 3 },
    });
    expect(journeyForSession({ mode: "answering", stationIndex: 2, plan }).state).toBe("answering");
    expect(journeyForSession({ mode: "on-break", stationIndex: 0, plan }).state).toBe("on-break");
    expect(journeyForSession({ mode: "at-station", stationIndex: 0, plan }).state).toBe("at-station");
    expect(journeyForSession({ mode: "complete", stationIndex: 2, plan }).state).toBe("finished");
  });
});

describe("applyStudyPhase", () => {
  test("sets the local train's phase from the study mode", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.setLocalTrainId("local");
    useStudySession.setState({ mode: "at-station" });
    applyStudyPhase();
    expect(useWorld.getState().trains.local?.phase).toBe("stopped");
    useStudySession.setState({ mode: "counting" });
    applyStudyPhase();
    expect(useWorld.getState().trains.local?.phase).toBe("running");
  });

  test("does nothing without a local train", () => {
    useStudySession.setState({ mode: "counting" });
    applyStudyPhase();
    expect(useWorld.getState().trains).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && bun test src/features/conductor/study-drive.test.ts`
Expected: FAIL, cannot find module `./study-drive`.

- [ ] **Step 3: Write study-drive.ts**

```ts
import type { Journey, TrainPhase } from "@grugchug/shared";
import { useEffect } from "react";
import { useWorld } from "@/features/world";
import { type SessionMode, useStudySession } from "./study-session";

// The study session is the source of truth for the local train: only a running
// timer moves it, completing the route is the terminus, and everything else is
// time at a platform (including no session at all).
export function phaseForMode(mode: SessionMode): TrainPhase {
  if (mode === "counting") return "running";
  if (mode === "complete") return "finished";
  return "stopped";
}

// Where this rider is, as the room should see it.
export function journeyForSession(s: {
  mode: SessionMode;
  stationIndex: number;
  plan: { stations: readonly unknown[] } | null;
}): Journey {
  const station = s.plan ? { index: s.stationIndex + 1, total: s.plan.stations.length } : null;
  switch (s.mode) {
    case "idle":
      return { state: "idle", station };
    case "counting":
      return { state: "studying", station };
    case "at-station":
      return { state: "at-station", station };
    case "answering":
      return { state: "answering", station };
    case "on-break":
      return { state: "on-break", station };
    case "complete":
      return { state: "finished", station };
  }
}

// One place writes the local train's phase. Idempotent, so it can run on every
// mode change and whenever the local train (re)appears.
export function applyStudyPhase(): void {
  const { mode } = useStudySession.getState();
  const { localTrainId, trains, setPhase } = useWorld.getState();
  if (localTrainId === null) return;
  const phase = phaseForMode(mode);
  if (trains[localTrainId]?.phase !== phase) setPhase(localTrainId, phase);
}

export function useStudyDrive(): void {
  useEffect(() => {
    applyStudyPhase();
    const unsubscribeStudy = useStudySession.subscribe((s, prev) => {
      if (s.mode !== prev.mode) applyStudyPhase();
    });
    const unsubscribeWorld = useWorld.subscribe((s, prev) => {
      if (s.localTrainId !== prev.localTrainId) applyStudyPhase();
    });
    return () => {
      unsubscribeStudy();
      unsubscribeWorld();
    };
  }, []);
}
```

`SessionMode` must be exported from `study-session.ts` (it already is).

- [ ] **Step 4: Run the study-drive tests**

Run: `cd apps/web && bun test src/features/conductor/study-drive.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing history tests**

`apps/web/src/features/conductor/history.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { endHistory, fetchHistory, recordHistory, startHistory } from "./history";

type Call = { url: string; init: RequestInit | undefined };

function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, fetchFn };
}

const session = {
  id: "s1",
  userId: "u1",
  planId: "p1",
  stationTotal: 2,
  startedAt: "2026-09-12T10:00:00.000Z",
  endedAt: null,
  outcome: null,
};

describe("history", () => {
  test("startHistory posts the start and returns the id", async () => {
    const { calls, fetchFn } = fakeFetch(200, session);
    const id = await startHistory({ userId: "u1", planId: "p1", stationTotal: 2 }, fetchFn);
    expect(id).toBe("s1");
    expect(calls[0]?.url).toBe("/api/study-sessions");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  test("startHistory swallows failures and returns null", async () => {
    const { fetchFn } = fakeFetch(500, {});
    expect(await startHistory({ userId: "u1", planId: "p1", stationTotal: 2 }, fetchFn)).toBeNull();
  });

  test("recordHistory and endHistory post to the session and never throw", async () => {
    const { calls, fetchFn } = fakeFetch(200, {});
    await recordHistory("s1", { stationIndex: 0, stationId: "a", passed: true, meanScore: 1 }, fetchFn);
    await endHistory("s1", "completed", fetchFn);
    expect(calls.map((c) => c.url)).toEqual([
      "/api/study-sessions/s1/stations",
      "/api/study-sessions/s1/end",
    ]);
    const { fetchFn: failing } = fakeFetch(500, {});
    await expect(endHistory("s1", "quit", failing)).resolves.toBeUndefined();
  });

  test("recordHistory and endHistory do nothing without a session id", async () => {
    const { calls, fetchFn } = fakeFetch(200, {});
    await recordHistory(null, { stationIndex: 0, stationId: "a", passed: true, meanScore: 1 }, fetchFn);
    await endHistory(null, "quit", fetchFn);
    expect(calls).toHaveLength(0);
  });

  test("fetchHistory parses the list and throws on failure", async () => {
    const summary = { ...session, stationsPassed: 1 };
    const { calls, fetchFn } = fakeFetch(200, [summary]);
    expect(await fetchHistory("u1", fetchFn)).toEqual([summary]);
    expect(calls[0]?.url).toBe("/api/study-sessions?userId=u1");
    const { fetchFn: failing } = fakeFetch(500, {});
    await expect(fetchHistory("u1", failing)).rejects.toThrow();
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `cd apps/web && bun test src/features/conductor/history.test.ts`
Expected: FAIL, cannot find module `./history`.

- [ ] **Step 7: Write history.ts**

```ts
import {
  type StartStudySessionRequest,
  type StationResultRequest,
  type StudyOutcome,
  type StudySessionSummary,
  studySessionSchema,
  studySessionSummarySchema,
} from "@grugchug/shared";

// History is a record, not a dependency: every write here fails quietly so a
// missing API never stops a study session. Reads (the dashboard) throw so the
// page can say the history is unavailable.
export const HISTORY_TIMEOUT_MS = 3000;

function post(url: string, body: unknown, fetchFn: typeof fetch): Promise<Response> {
  return fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(HISTORY_TIMEOUT_MS),
  });
}

export async function startHistory(
  body: StartStudySessionRequest,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await post("/api/study-sessions", body, fetchFn);
    if (!res.ok) return null;
    return studySessionSchema.parse(await res.json()).id;
  } catch {
    return null;
  }
}

export async function recordHistory(
  sessionId: string | null,
  body: StationResultRequest,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  if (sessionId === null) return;
  try {
    await post(`/api/study-sessions/${sessionId}/stations`, body, fetchFn);
  } catch {
    // A lost verdict is a gap in the dashboard, not a broken session.
  }
}

export async function endHistory(
  sessionId: string | null,
  outcome: StudyOutcome,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  if (sessionId === null) return;
  try {
    await post(`/api/study-sessions/${sessionId}/end`, { outcome }, fetchFn);
  } catch {
    // Same: never block quitting or completing on the network.
  }
}

export async function fetchHistory(
  userId: string,
  fetchFn: typeof fetch = fetch,
): Promise<StudySessionSummary[]> {
  const res = await fetchFn(`/api/study-sessions?userId=${encodeURIComponent(userId)}`, {
    signal: AbortSignal.timeout(HISTORY_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GET /api/study-sessions failed with ${res.status}`);
  return studySessionSummarySchema.array().parse(await res.json());
}
```

- [ ] **Step 8: Run the history tests**

Run: `cd apps/web && bun test src/features/conductor/history.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 9: Write the failing study-session narration tests**

Read `study-session.test.ts` to learn its mocking approach, then add tests (using the same approach) that assert, after each action, what the local train is saying and what efficiency received. Use the world store directly: create a local train (`useWorld.getState().addTrain(...)`, `setLocalTrainId("local")`) in `beforeEach`, and read `useWorld.getState().trains.local?.speech`. Reset `useEfficiency` between tests (`useEfficiency.setState({ signals: {} })` or its own reset if it has one). Cases:

1. `startStudying` on a fresh plan says `VOICE_LINES.startSession.text` with its `audioUrl`, and `historyId` becomes the id the (mocked) history POST returned.
2. `tick` when the counting timer has passed says `Now arriving: <title of the current station>` with no `audioUrl`, and the mode becomes `at-station`.
3. `chooseBreak` says `VOICE_LINES.takeBreak.text`; `tick` after the break timer says `Break's over.`.
4. `chooseKeepStudying` says `VOICE_LINES.restartStudy.text`.
5. `submitAllAndFinish` with a passing evaluation on a non-final station says `VOICE_LINES.passQuiz.text`, reports a `"quiz"` signal to efficiency whose value equals the mean of the graded scores, calls the history record with `passed: true`, and the following `startStudying` does not replace the line (speech text is still `passQuiz`).
6. `submitAllAndFinish` passing the final station says `VOICE_LINES.greatSession.text`, sets `mode` to `complete`, and ends history with `completed`.
7. `quit` mid-session ends history with `quit`; no `setPhase` is called anywhere in `study-session.ts` (grep assertion is not a test; just make sure the existing tests that asserted phases now assert via `applyStudyPhase()`).

Mock `./history` with `mock.module` (or however `./api` is mocked) so `startHistory` resolves `"h1"` and the record/end functions capture calls.

- [ ] **Step 10: Run to verify failure**

Run: `cd apps/web && bun test src/features/conductor/study-session.test.ts`
Expected: the new tests FAIL (no speech, no quiz signal, no history).

- [ ] **Step 11: Change study-session.ts**

Imports: add

```ts
import { useEfficiency } from "@/features/efficiency";
import { sayLine, sayText } from "@/features/speech";
import { endHistory, recordHistory, startHistory } from "./history";
```

and remove `import { useWorld } from "@/features/world";` and the `localTrainId()` helper once every `setPhase` call is gone.

State: add `historyId: string | null;` to `StudySessionState`, initial `null`, included in `startSession`'s reset (`historyId: null`), `quit`'s reset, and `persist` (`historyId: state.historyId`) and `hydrate` (`historyId: saved.historyId`). In `session-storage.ts`, add `historyId: string | null;` to `PersistedSession` and treat a saved record without it as `null` when reading.

Constants at module scope:

```ts
// Quiz results are one more opinion about how the sitting is going: half the
// pull of attention, fading over ten minutes so a bad station is not forever.
const QUIZ_SOURCE = "quiz";
const QUIZ_WEIGHT = 0.5;
const QUIZ_HALF_LIFE_MS = 10 * 60_000;
```

`startStudying`: after `set({ mode: "counting", ... })` and `persist`, and before closing the panel:

```ts
      // A fresh route departs with the all-aboard line and opens its history
      // record; a departure after a passed station stays quiet, the pass line
      // is still playing.
      if (state.historyId === null) {
        sayLine("startSession");
        const historyId = await startHistory({
          userId: getUserId(),
          planId: state.plan.id,
          stationTotal: state.plan.stations.length,
        });
        set({ historyId });
        persist(get());
      }
```

`tick`: remove the `setPhase` line; in the `counting` branch add `const station = currentStation(state); if (station) sayText(\`Now arriving: ${station.title}\`);` before `set(...)`; in the `on-break` branch add `sayText("Break's over.");`.

`chooseKeepStudying`: remove the `setPhase` lines; after the timer `set(...)` add `sayLine("restartStudy");`.

`chooseBreak`: after its `set(...)` add `sayLine("takeBreak");`.

`submitAllAndFinish`: after `results` is built and stored, add

```ts
    const scores = station.questions.map((q) => results[q.id]?.score ?? 0);
    const meanScore = scores.reduce((sum, s) => sum + s, 0) / Math.max(1, scores.length);
    useEfficiency.getState().report(QUIZ_SOURCE, meanScore, {
      label: "Quiz",
      weight: QUIZ_WEIGHT,
      halfLifeMs: QUIZ_HALF_LIFE_MS,
    });
```

After `evaluateProgress` returns `{ passed, feedback }`, add

```ts
      await recordHistory(state.historyId, {
        stationIndex: state.stationIndex,
        stationId: station.id,
        passed,
        meanScore,
      });
```

then remove both `setPhase` calls. In the final-station branch add `sayLine("greatSession");` and `await endHistory(state.historyId, "completed");` before `set({ mode: "complete", ... })`. In the next-station branch add `sayLine("passQuiz");` before `set({ stationIndex: nextIndex, ... })`.

`quit`: remove the phase check and `setPhase`; add at the top

```ts
    const { historyId, mode } = get();
    if (mode !== "complete") {
      // Fire and forget: quitting must be instant even with the API down.
      endHistory(historyId, "quit").catch(() => undefined);
    }
```

(`endHistory` already swallows errors; the `.catch` is belt and braces for an unhandled-rejection lint.)

- [ ] **Step 12: Mount the drive and export**

In `conductor-overlay.tsx`, import `useStudyDrive` from `./study-drive` and call `useStudyDrive();` inside `ConductorOverlay` before the existing effects. In `index.ts` add:

```ts
export { fetchHistory } from "./history";
export { applyStudyPhase, journeyForSession, phaseForMode, useStudyDrive } from "./study-drive";
```

- [ ] **Step 13: Verify and commit**

Run: `cd apps/web && bun test src/features/conductor && cd ../.. && bun run typecheck && bun run lint && bun run build`
Expected: pass. `grep -n "setPhase" apps/web/src/features/conductor/study-session.ts` returns nothing.

```bash
bun run fmt
git add apps/web/src/features/conductor
git commit -m "Let the study session drive and narrate the train

One projection maps study mode to train phase; the loop speaks its own
moments through features/speech, reports quiz means to efficiency, and
records start, verdicts, and the end to the API.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N9ri2hm9heyG387RwYuyVU"
```

---

### Task 7a: Presence carries the journey (hub and chat)

**Files:**
- Modify: `apps/api/src/chat/hub.ts`, `hub.test.ts`
- Create: `apps/web/src/features/chat/journey-link.ts`, `journey-link.test.ts`
- Modify: `apps/web/src/features/chat/use-chat-room.ts`, `chat-panel.tsx`, `chat-panel.test.tsx`, `index.ts`

**Interfaces:**
- Consumes: `Journey`, `AvatarId`, the `journey` client event, presence fields (T3); `avatarUrl` from `@/features/profile`.
- Produces: hub stores `avatar?: AvatarId` and `journey?: Journey` per socket and includes them on roster entries; `setJourneySink(sink | null)`, `reportJourney(status: { avatar: AvatarId; journey: Journey })`; `journeyLabel(journey: Journey | undefined): string`; roster rows in the chat panel. `@/features/chat` exports `reportJourney`.

- [ ] **Step 1: Hub**

Read `hub.ts` and `hub.test.ts`. Add `avatar?: AvatarId` and `journey?: Journey` to `ChatSocketData`; leave them undefined in `newSocketData`. Add

```ts
// Journey updates are rare (a handful per session) and never touch the
// database; like focus they skip the rate limiter and just broadcast.
function handleJourney(ws: ChatSocket, event: Extract<ClientChatEvent, { type: "journey" }>): void {
  ws.data.avatar = event.avatar;
  ws.data.journey = event.journey;
  broadcastPresence(ws.data.roomId);
}
```

Dispatch it where `focus` is dispatched. In the roster builder, spread `avatar` and `journey` onto each member only when defined (the presence schema has them optional; do not emit `undefined` keys). Add a hub test mirroring the focus test: after a `journey` event, the broadcast presence for that member includes the avatar and journey; a member who never sent one has neither key.

- [ ] **Step 2: journey-link.ts (test first)**

`journey-link.test.ts`:

```ts
import { beforeEach, describe, expect, test } from "bun:test";
import type { Journey } from "@grugchug/shared";
import { reportJourney, setJourneySink } from "./journey-link";

const studying: Journey = { state: "studying", station: { index: 1, total: 3 } };
const atStation: Journey = { state: "at-station", station: { index: 1, total: 3 } };

beforeEach(() => setJourneySink(null));

describe("reportJourney", () => {
  test("sends a status once and ignores repeats", () => {
    const sent: unknown[] = [];
    setJourneySink((s) => sent.push(s));
    reportJourney({ avatar: "cat", journey: studying });
    reportJourney({ avatar: "cat", journey: { ...studying, station: { index: 1, total: 3 } } });
    reportJourney({ avatar: "cat", journey: atStation });
    expect(sent).toEqual([
      { avatar: "cat", journey: studying },
      { avatar: "cat", journey: atStation },
    ]);
  });

  test("a new sink gets the last status again", () => {
    reportJourney({ avatar: "doug", journey: studying });
    const sent: unknown[] = [];
    setJourneySink((s) => sent.push(s));
    expect(sent).toEqual([{ avatar: "doug", journey: studying }]);
  });

  test("does nothing without a sink", () => {
    expect(() => reportJourney({ avatar: "poku", journey: studying })).not.toThrow();
  });
});
```

`journey-link.ts`:

```ts
// One-way pipe for where you are on your route: features/session pushes it in,
// the live socket carries it out to the room. Changes are rare, so there is no
// throttle, only de-duplication; a fresh socket is told the current status.
import type { AvatarId, Journey } from "@grugchug/shared";

export type JourneyStatus = { avatar: AvatarId; journey: Journey };

type JourneySink = (status: JourneyStatus) => void;

let sink: JourneySink | null = null;
let last: JourneyStatus | null = null;

/** The open socket registers itself here; null on disconnect. */
export function setJourneySink(next: JourneySink | null): void {
  sink = next;
  if (sink && last) sink(last);
}

export function reportJourney(status: JourneyStatus): void {
  if (last && JSON.stringify(last) === JSON.stringify(status)) return;
  last = status;
  sink?.(status);
}
```

- [ ] **Step 3: Socket and index**

In `use-chat-room.ts`, next to each `setFocusSink(...)` call add the matching `setJourneySink(...)`: on open, `setJourneySink((status) => sendEvent({ type: "journey", ...status }))`; where the focus sink is cleared, clear the journey sink too. In `index.ts` export `reportJourney` from `./journey-link` (and the `JourneyStatus` type).

- [ ] **Step 4: Roster rows (test first)**

Add to `chat-panel.test.tsx` (next to the `ridersLabel` tests):

```ts
describe("journeyLabel", () => {
  test("describes where a rider is", () => {
    expect(journeyLabel(undefined)).toBe("");
    expect(journeyLabel({ state: "idle", station: null })).toBe("");
    expect(journeyLabel({ state: "studying", station: { index: 2, total: 6 } })).toBe("Station 2 of 6");
    expect(journeyLabel({ state: "at-station", station: { index: 2, total: 6 } })).toBe("At station 2");
    expect(journeyLabel({ state: "answering", station: { index: 2, total: 6 } })).toBe("Answering at station 2");
    expect(journeyLabel({ state: "on-break", station: { index: 2, total: 6 } })).toBe("On a break");
    expect(journeyLabel({ state: "finished", station: { index: 6, total: 6 } })).toBe("Finished");
  });
});
```

In `chat-panel.tsx` add beside `ridersLabel`:

```ts
/** One rider's place on their route, or nothing worth saying. Pure for tests. */
export function journeyLabel(journey: Journey | undefined): string {
  if (!journey) return "";
  const at = journey.station ? `station ${journey.station.index}` : "the platform";
  switch (journey.state) {
    case "idle":
      return "";
    case "studying":
      return journey.station ? `Station ${journey.station.index} of ${journey.station.total}` : "Studying";
    case "at-station":
      return `At ${at}`;
    case "answering":
      return `Answering at ${at}`;
    case "on-break":
      return "On a break";
    case "finished":
      return "Finished";
  }
}
```

and, under the header (after the riders sentence, still inside the header), a compact list:

```tsx
        {roster.length > 0 && (
          <ul className="flex flex-col gap-1 pt-1">
            {roster.map((member) => (
              <li key={member.userId} className="flex items-center gap-2 text-xs">
                <img
                  src={member.avatar ? avatarUrl(member.avatar) : spriteFor(member.userId)}
                  alt=""
                  className="size-6 rounded-full bg-background/60"
                />
                <span className="min-w-0 flex-1 truncate">{member.displayName}</span>
                <span className="text-muted-foreground">{journeyLabel(member.journey)}</span>
              </li>
            ))}
          </ul>
        )}
```

Import `avatarUrl` from `@/features/profile`. For `spriteFor`, do not import `features/session` (that would be a cycle: session already imports chat); write a tiny local fallback that returns `"/characters/default.svg"`. Add a rendering test: render `ChatPanel` is heavy (socket hooks), so instead test `journeyLabel` only plus one shallow test that a row renders an `img` with the avatar URL if the component tree allows; if `ChatPanel` cannot render offline, extract the list into `RosterList({ members })` in the same file and test that.

- [ ] **Step 5: Verify and commit**

Run: `cd apps/api && bun test src/chat && cd ../web && bun test src/features/chat && cd ../.. && bun run typecheck && bun run lint && bun run build`
Expected: pass.

```bash
bun run fmt
git add apps/api/src/chat/hub.ts apps/api/src/chat/hub.test.ts \
  apps/web/src/features/chat/journey-link.ts apps/web/src/features/chat/journey-link.test.ts \
  apps/web/src/features/chat/use-chat-room.ts apps/web/src/features/chat/chat-panel.tsx \
  apps/web/src/features/chat/chat-panel.test.tsx apps/web/src/features/chat/index.ts
git commit -m "Carry each rider's avatar and journey on presence

A journey client event, a journey sink beside the focus one, and roster
rows in the chat panel showing avatar, name, and where they are.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N9ri2hm9heyG387RwYuyVU"
```

---

### Task 7b: Session pushes the journey and maps it onto companion trains

**Files:**
- Modify: `apps/web/src/features/session/party.ts`, `party.test.ts`
- Create: `apps/web/src/features/session/use-journey-link.ts`, `use-journey-link.test.ts`
- Modify: `apps/web/src/features/session/index.ts`

**Interfaces:**
- Consumes: `reportJourney` from `@/features/chat` (T7a); `journeyForSession`, `useStudySession` from `@/features/conductor` (T6); `useProfile`, `avatarUrl` from `@/features/profile`; `Journey`, `TrainPhase`, `ChatPresenceMember` from shared.
- Produces: `phaseForJourney(journey: Journey | undefined): TrainPhase`; `partyTrains` uses `member.avatar` and `member.journey`; `syncJourney(): void` (pure-ish, reads stores, calls `reportJourney`); `useJourneyLink(): void`. `index.ts` exports `phaseForJourney`, `useJourneyLink`, `syncJourney`, and replaces `export type { Session }` with `export type { StudySession } from "@grugchug/shared";`. Task 3's deprecated `Session` alias is then deleted from `packages/shared/src/schemas/session.ts` (this task, one line).

- [ ] **Step 1: Failing party tests**

Add to `party.test.ts`:

```ts
describe("partyTrains with journeys", () => {
  const base = { userId: "u2", displayName: "Ada", efficiency: 0.5 };

  test("uses the rider's own avatar when presence carries one", () => {
    const [train] = partyTrains([{ ...base, avatar: "cat" }], "me");
    expect(train?.owner.spriteUrl).toBe("/characters/cat.png");
  });

  test("falls back to the hashed sprite without an avatar", () => {
    const [train] = partyTrains([base], "me");
    expect(train?.owner.spriteUrl).toBe(spriteForUserId("u2"));
  });

  test("stops at a station, on a break, or while answering; runs while studying", () => {
    const at = (state: Journey["state"]) =>
      partyTrains([{ ...base, journey: { state, station: { index: 1, total: 2 } } }], "me")[0]?.phase;
    expect(at("studying")).toBe("running");
    expect(at("at-station")).toBe("stopped");
    expect(at("answering")).toBe("stopped");
    expect(at("on-break")).toBe("stopped");
    expect(at("idle")).toBe("stopped");
    expect(at("finished")).toBe("finished");
  });

  test("a rider with no journey keeps running as before", () => {
    expect(partyTrains([base], "me")[0]?.phase).toBe("running");
  });
});
```

- [ ] **Step 2: Implement in party.ts**

```ts
import type { ChatPresenceMember, Journey, TrainPhase, TrainState } from "@grugchug/shared";
import { avatarUrl } from "@/features/profile";

// A friend's phase follows their journey. No journey means an older client
// that never said, and those keep running as companions always did.
export function phaseForJourney(journey: Journey | undefined): TrainPhase {
  if (!journey) return "running";
  if (journey.state === "studying") return "running";
  if (journey.state === "finished") return "finished";
  return "stopped";
}
```

and in `partyTrains` map each member to

```ts
      owner: {
        name: member.displayName,
        spriteUrl: member.avatar ? avatarUrl(member.avatar) : spriteForUserId(member.userId),
      },
      phase: phaseForJourney(member.journey),
```

Update the file's header comment: companions are no longer always running. `use-party-trains.ts` already re-adds trains from `partyTrains` on every roster change, so a friend's phase change flows into the world with no further change.

- [ ] **Step 3: Failing journey-link hook test**

`use-journey-link.test.ts` — test the pure `syncJourney` rather than the hook: mock `@/features/chat`'s `reportJourney` with `mock.module` (or spy via a module-level setter if the codebase prefers), set `useStudySession` state `{ mode: "counting", stationIndex: 0, plan: { stations: [{}, {}] } as never }` and `useProfile` state `{ user: { avatar: "doug", ... } }`, call `syncJourney()`, and assert `reportJourney` was called with `{ avatar: "doug", journey: { state: "studying", station: { index: 1, total: 2 } } }`. A second test: with no profile user, the avatar reported is `"poku"` (the default).

- [ ] **Step 4: Write use-journey-link.ts**

```ts
import { useEffect } from "react";
import { reportJourney } from "@/features/chat";
import { journeyForSession, useStudySession } from "@/features/conductor";
import { useProfile } from "@/features/profile";

const DEFAULT_AVATAR = "poku" as const;

// The room should see where you are and what you look like. Session is the
// bridge: it reads the study session and the profile, and hands chat a status.
export function syncJourney(): void {
  const { mode, stationIndex, plan } = useStudySession.getState();
  const avatar = useProfile.getState().user?.avatar ?? DEFAULT_AVATAR;
  reportJourney({ avatar, journey: journeyForSession({ mode, stationIndex, plan }) });
}

export function useJourneyLink(): void {
  useEffect(() => {
    syncJourney();
    const unsubscribeStudy = useStudySession.subscribe((s, prev) => {
      if (s.mode !== prev.mode || s.stationIndex !== prev.stationIndex || s.plan !== prev.plan) {
        syncJourney();
      }
    });
    const unsubscribeProfile = useProfile.subscribe((s, prev) => {
      if (s.user?.avatar !== prev.user?.avatar) syncJourney();
    });
    return () => {
      unsubscribeStudy();
      unsubscribeProfile();
    };
  }, []);
}
```

Export from `index.ts`: `phaseForJourney` (from `./party`), `syncJourney`, `useJourneyLink`. Replace the `Session` type re-export with `StudySession`, then delete the deprecated alias line from `packages/shared/src/schemas/session.ts`.

- [ ] **Step 5: Verify and commit**

Run: `cd apps/web && bun test src/features/session && cd ../.. && bun run typecheck && bun run lint && bun run build`

```bash
bun run fmt
git add apps/web/src/features/session packages/shared/src/schemas/session.ts
git commit -m "Push the journey into chat and stop friends at their stations

Session reports avatar and journey to the room and maps the roster's
journeys onto companion phases and real avatars.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N9ri2hm9heyG387RwYuyVU"
```

---

### Task 7c: Every lane spawns its own stations

**Files:**
- Modify: `apps/web/src/features/scene/train.tsx`
- Modify: `apps/web/src/features/scene/lane.tsx`

**Interfaces:**
- Consumes: `registerMotion`, `unregisterMotion`, `getMotion` from `./motion`.
- Produces: companion motion is registered under its train id; `Lane` spawns stations for any train.

No unit tests (WebGL). Verification: typecheck, lint, build, and the manual check below.

- [ ] **Step 1: train.tsx**

Import `registerMotion` and `unregisterMotion`. After the `own`/`synced` refs, add

```ts
  // Lanes read a companion's motion from the registry to place its stations.
  useEffect(() => {
    if (isLocal) return;
    registerMotion(trainId, own.current);
    return () => unregisterMotion(trainId);
  }, [trainId, isLocal]);
```

In the frame callback, replace

```ts
        const drifted = driftGap(own.current, lane.scroll);
        const closed = drifted - driftClosing(drifted, own.current.speed - lane.speed, step);
```

with

```ts
        // A friend resting at their platform keeps their distance: closing the
        // gap would slide the train off the station it stopped at.
        const drifted = driftGap(own.current, lane.scroll);
        const closing =
          own.current.stopTarget === null
            ? driftClosing(drifted, own.current.speed - lane.speed, step)
            : 0;
        const closed = drifted - closing;
```

- [ ] **Step 2: lane.tsx**

Replace the station effect so it applies to every lane, reading the right motion:

```ts
  // A phase change on this lane's train is what creates a station. The local
  // train is the lane; a companion's motion comes from the registry, where
  // train.tsx registered it.
  useEffect(() => {
    const m = isLocal ? motion.current : getMotion(trainId);
    if (!m) return;
    if (phase === "running" || phase === undefined) {
      m.stopTarget = null;
      pendingStation.current = false;
      return;
    }
    const terminus = phase === "finished";
    if (pendingStation.current) {
      setStations((list) => list.map((s, i) => (i === list.length - 1 ? { ...s, terminus } : s)));
      return;
    }
    // A train that is already standing still gets its station right here.
    const distance = m.speed < 0.01 ? 0 : STATION_DISTANCE;
    const target = m.scroll + distance;
    m.stopTarget = target;
    pendingStation.current = true;
    const id = nextStationId.current++;
    setStations((list) => [...list, { id, worldX: target, terminus }]);
  }, [phase, motion, isLocal, trainId]);
```

Import `getMotion` from `./motion`. Check the local branch matches what the file did before for the local train (the previous code cleared `stopTarget` on running through `m.stopTarget = null`; if it did not, keep the old local behaviour exactly and only add the companion path). Station meshes keep `motion` (the lane motion) for positioning; a companion's `own.scroll` is `lane.scroll + gap`, so `worldX - lane.scroll` is where its body is when it rests. Update the file's header comment.

A companion's `own` motion is created in `Train`, which mounts as a child of `Lane`, so on the first render `getMotion(trainId)` may be undefined; the effect's `phase` dependency re-runs on the next phase change, which is when a station is needed. If the friend is already `stopped` when it first appears, the station appears on its next stop; note this in the report.

- [ ] **Step 3: Verify, manual check, commit**

Run: `bun run typecheck && bun run lint && bun run build`.

Manual (controller): `bun run dev`, `/session?dev`, add two friends; the dev panel toggles friends between running and stopped every 8 to 15 s. Expected: when a friend stops, a platform appears ahead on its lane and the friend's train brakes to it and rests there, falling behind you as you run; when you also stop, the friend does not slide toward you; when the friend runs again, it pulls away from its platform and gradually catches up alongside.

```bash
bun run fmt
git add apps/web/src/features/scene/train.tsx apps/web/src/features/scene/lane.tsx
git commit -m "Let companion trains stop at stations on their own lanes

Register companion motion so each lane can place a platform where its
train will halt, and hold the drift while a friend rests there.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N9ri2hm9heyG387RwYuyVU"
```

---

### Task 8: Wiring, dashboard, docs

**Files:**
- Modify: `apps/web/src/routes/session.tsx`
- Delete: `apps/web/src/features/speech/departure.ts`, `departure.test.ts`, `use-departure-announcer.ts`; modify `apps/web/src/features/speech/index.ts`
- Create: `apps/web/src/features/conductor/session-history.tsx`, `session-history.test.tsx`
- Modify: `apps/web/src/features/conductor/index.ts`, `apps/web/src/routes/dashboard.tsx`
- Modify: `.llm/architecture.md`, `.llm/AGENTS.md`, `docs/specs/2026-09-12-study-loop-design.md`, `docs/specs/2026-09-12-sqlite-storage-design.md`

- [ ] **Step 1: session.tsx**

- Remove `useDepartureAnnouncer` from the import and the call; import `useJourneyLink` from `@/features/session` and call it after `usePartyTrains()` with the comment `// The room hears where you are on your route.`
- Change the local train's `phase: "running"` to `phase: "stopped"` and its comment to: `// Waiting at the platform until Start studying; the study session drives the phase from here.`

- [ ] **Step 2: Remove the phase announcer**

`git rm` the three departure files. In `features/speech/index.ts` drop the `useDepartureAnnouncer` export and update the header comment (narration is the study session's; the player and `sayLine`/`sayText` remain). Fix any remaining import (`grep -rn "useDepartureAnnouncer\|departure" apps/web/src`).

- [ ] **Step 3: SessionHistory (test first)**

`session-history.test.tsx`: render `<SessionHistory load={() => Promise.resolve([summary])} />` where `summary` is a completed session with `stationsPassed: 3`, `stationTotal: 4`, started 10:00 and ended 10:42; `await screen.findByText(/3 of 4 stations/)` and `screen.getByText(/42 min/)`; a second test with a rejecting `load` shows "History is unavailable right now."; a third with `[]` shows "No sessions yet. Open the conductor in a session to start one."

`session-history.tsx`:

```tsx
import type { StudySessionSummary } from "@grugchug/shared";
import { useEffect, useState } from "react";
import { getUserId } from "@/lib/user-id";
import { fetchHistory } from "./history";

type Props = { load?: () => Promise<StudySessionSummary[]> };

function minutesBetween(a: string, b: string | null): number | null {
  if (!b) return null;
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));
}

// Your recent runs through a route, newest first. `load` is injectable for tests.
export function SessionHistory({ load = () => fetchHistory(getUserId()) }: Props) {
  const [sessions, setSessions] = useState<StudySessionSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((list) => {
        if (!cancelled) setSessions(list);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (failed) return <p className="text-sm text-destructive">History is unavailable right now.</p>;
  if (sessions === null) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No sessions yet. Open the conductor in a session to start one.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {sessions.map((s) => {
        const minutes = minutesBetween(s.startedAt, s.endedAt);
        return (
          <li key={s.id} className="flex flex-wrap items-baseline gap-x-3 rounded-lg border p-3 text-sm">
            <span className="font-medium">{new Date(s.startedAt).toLocaleString()}</span>
            <span>
              {s.stationsPassed} of {s.stationTotal} stations
            </span>
            <span className="text-muted-foreground">
              {minutes === null ? "in progress" : `${minutes} min`}
            </span>
            <span className="text-muted-foreground">{s.outcome ?? ""}</span>
          </li>
        );
      })}
    </ul>
  );
}
```

Export `SessionHistory` from the conductor `index.ts`. `dashboard.tsx`:

```tsx
import { SessionHistory } from "@/features/conductor";

export function Dashboard() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <SessionHistory />
    </div>
  );
}
```

(The existing `dashboard.test.tsx` renders `Dashboard`; `SessionHistory` will call the real `fetchHistory` under happy-dom and fail quietly into "History is unavailable right now." — assert the heading still renders and add `await screen.findByText(/unavailable|No sessions|Loading/)` so the test does not race.)

- [ ] **Step 4: Docs**

`.llm/architecture.md`: in the api table, replace the `src/db.ts` row with "`bun:sqlite` database at `SQLITE_PATH` (default `apps/api/data/grugchug.sqlite`) with the idempotent schema; the stores are the only SQL"; add rows for `src/study/store.ts` and `src/routes/study-sessions.ts`; change the `chat/store.ts` and `conductor/store.ts` rows to say SQLite; add the four study-session endpoints to the "Conductor API" table or a new "Study history" list; in the web table update `features/session/` ("…pushes journey status into chat…"), `features/conductor/` (if a row exists: "…drives the local train's phase, narrates the loop, reports quiz means, records history"), `features/speech/` (no phase announcer), `features/chat/` (roster rows show avatar and journey); in the shared table add `journey` and replace `session` with the study-session shapes; in Deferred remove Mongo and "quiz-to-efficiency not wired" lines. `.llm/AGENTS.md`: replace the MongoDB/compose mentions (layout and commands) with SQLite (`SQLITE_PATH`, no docker), and amend the "only writer into world" convention: `features/session` (score, companions), `features/speech` (utterances), `features/conductor` (the local train's phase via `applyStudyPhase`).

Append a `## Deviations (recorded after implementation)` section to each spec with anything that differed, including the note from Task 7c about a friend already stopped on first appearance.

- [ ] **Step 5: Full chain, manual pass, commit**

Run: `bun run typecheck && bun run test && bun run lint && bun run build`.

Manual (controller): `bun run dev` (no Mongo needed). `/session?dev`: the train waits at a platform; open the conductor, upload text, Study, Start studying → all-aboard clip, train departs; use the dev timer if one exists or wait; at the station the "Now arriving" bubble; Take a break → break clip; when the break ends, "Break's over"; Answer questions → pass → pass-quiz clip, departs; final station → great-session clip and a terminus. Dashboard lists the run. Open a second browser profile in the same room: their train shows your avatar choice, stops when you are at a station, and the chat roster shows both avatars with "Station n of m".

```bash
bun run fmt
git add apps/web/src/routes/session.tsx apps/web/src/routes/dashboard.tsx \
  apps/web/src/features/speech/index.ts apps/web/src/features/conductor/session-history.tsx \
  apps/web/src/features/conductor/session-history.test.tsx apps/web/src/features/conductor/index.ts \
  apps/web/src/routes/dashboard.test.tsx .llm/architecture.md .llm/AGENTS.md \
  docs/specs/2026-09-12-study-loop-design.md docs/specs/2026-09-12-sqlite-storage-design.md
git rm -q apps/web/src/features/speech/departure.ts apps/web/src/features/speech/departure.test.ts \
  apps/web/src/features/speech/use-departure-announcer.ts
git commit -m "Wire the study loop end to end and list history on the dashboard

The train waits at the platform until Start studying, the room hears
your journey, the phase announcer gives way to the loop's own
narration, and the dashboard shows recent runs.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N9ri2hm9heyG387RwYuyVU"
```

- [ ] **Step 6: Hand back**

Use `superpowers:finishing-a-development-branch`. Target is `main` by pull request; GitHub CLI is not installed, so push and hand the user the compare link plus a PR description.
