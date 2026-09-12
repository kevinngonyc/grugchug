# SQLite storage

Everything the API persists moves from MongoDB to one local SQLite file
through Bun's built-in `bun:sqlite`. No driver dependency, no `docker compose`
for local development, and the store modules become testable offline against
an in-memory database instead of being the only untested code in the API.

This spec covers the database module, the three existing stores (users, route
plans, chat), and the two new tables the study loop needs. The study loop's
routes and web wiring are in `2026-09-12-study-loop-design.md`.

## Decisions

- One file, `apps/api/data/grugchug.sqlite`, created on first open. `SQLITE_PATH`
  overrides it; tests pass `:memory:`. `*.sqlite` is already git-ignored.
- WAL journal mode and `foreign_keys = ON` at open. Single API process; SQLite
  is not shared between instances.
- Schema is a list of idempotent `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX
  IF NOT EXISTS` statements run at open. No migration framework: the data is
  a study group's, and a shape change means a new column with a default or a
  new table.
- Dates are ISO-8601 strings in `TEXT` columns, which is what the shared
  schemas already carry. Route plans are stored as JSON `TEXT`, validated with
  `routePlanSchema` on read exactly as today.
- Store modules keep their exported function names and signatures, and stay
  `async` even though `bun:sqlite` is synchronous, so no caller changes.
- `mongodb` leaves `apps/api/package.json`; `compose.yaml` and `MONGODB_URI`
  go away; `.env.example` gains `SQLITE_PATH`.

## Database module (`apps/api/src/db.ts`)

```ts
openDatabase(path: string): Database   // applies SCHEMA, sets pragmas
getDatabase(): Database                // memoized openDatabase(process.env.SQLITE_PATH ?? default)
```

`openDatabase` is what tests call with `:memory:`. `SCHEMA` is exported so a
test can assert every table it expects exists.

## Tables

```sql
users            (id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT NOT NULL,
                  created_at TEXT NOT NULL)
route_plans      (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, plan TEXT NOT NULL,
                  created_at TEXT NOT NULL)
chat_rooms       (id TEXT PRIMARY KEY, name TEXT NOT NULL,
                  invite_code TEXT NOT NULL UNIQUE, created_by TEXT NOT NULL,
                  created_at TEXT NOT NULL)
chat_members     (room_id TEXT NOT NULL, user_id TEXT NOT NULL,
                  display_name TEXT NOT NULL, joined_at TEXT NOT NULL,
                  PRIMARY KEY (room_id, user_id))
                  INDEX (user_id, joined_at DESC)
chat_messages    (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, user_id TEXT NOT NULL,
                  display_name TEXT NOT NULL, body TEXT NOT NULL,
                  created_at TEXT NOT NULL)
                  INDEX (room_id, created_at DESC, id DESC)
study_sessions   (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, plan_id TEXT NOT NULL,
                  station_total INTEGER NOT NULL, started_at TEXT NOT NULL,
                  ended_at TEXT, outcome TEXT)         -- outcome: completed | quit | NULL
                  INDEX (user_id, started_at DESC)
station_results  (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL
                  REFERENCES study_sessions(id), station_index INTEGER NOT NULL,
                  station_id TEXT NOT NULL, passed INTEGER NOT NULL,
                  mean_score REAL NOT NULL, recorded_at TEXT NOT NULL)
                  INDEX (session_id)
```

A station can be attempted more than once (fail, study more, pass), so
`station_results` keeps every attempt; "passed" for a session means the
latest attempt at that index passed.

## Stores

| Module | Change |
|---|---|
| `users-repo.ts` | `sqliteUserRepo(db)` replaces `mongoUserRepo(getDb)`. Same `UserRepo` interface. `upsert` is `INSERT ... ON CONFLICT(id) DO UPDATE SET name, avatar`, so `created_at` is written once. `memoryUserRepo` is deleted; tests use `sqliteUserRepo(openDatabase(":memory:"))` |
| `conductor/store.ts` | `saveRoutePlan` inserts `{ id, user_id, plan: JSON }`; `getRoutePlanById` parses and validates. Same signatures |
| `chat/store.ts` | Same exported functions: `joinRoomByInviteCode`, `findOrCreateRoomForUser`, `setDisplayName`, `findMember`, `listMessages`, `insertMessage`, `DEFAULT_ROOM_NAME`. Member upsert uses `INSERT ... ON CONFLICT(room_id, user_id) DO UPDATE`, refreshing `joined_at` only when `entering`. Invite-code collisions retry on `SQLITE_CONSTRAINT_UNIQUE`. `listMessages` pages by `(created_at, id) < anchor` and returns ascending, as today |
| `study/store.ts` | New: `startStudySession`, `recordStationResult`, `endStudySession`, `listStudySessions(userId)` returning shapes from `packages/shared` (defined in the study loop spec) |

Every store takes the `Database` from `getDatabase()` by default; each also
accepts one explicitly so tests inject `:memory:`. The stores are the only
files that write SQL.

## Testing

- `db.test.ts`: `openDatabase(":memory:")` creates every table in `SCHEMA`;
  opening twice on the same file is idempotent.
- `users-repo.test.ts`: existing route tests run against the SQLite repo;
  `createdAt` survives a second upsert.
- `conductor/store.test.ts`: save then get round-trips a fixture plan; a row
  whose JSON fails `routePlanSchema` reads as `null`.
- `chat/store.test.ts` (new coverage): create and join by invite code; joining
  twice refreshes the name and re-enters; `findOrCreateRoomForUser` returns the
  most recently joined room and makes a fresh one when none exists;
  `setDisplayName` renames every membership; `listMessages` pages backwards
  through a same-millisecond boundary without skipping or repeating.
- `study/store.test.ts`: start, record two attempts at one station, end;
  `listStudySessions` reports the latest attempt per station.
- `bun test` stays offline: every test opens `:memory:`.

## Out of scope

- Data migration from an existing MongoDB. Nothing has been deployed; local
  databases start empty.
- Multi-instance deployment. If the API ever runs more than one process, this
  is the spec to revisit.
