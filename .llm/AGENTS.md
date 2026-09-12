# grugchug

Study buddy web app. Webcam head pose drives a study-focus score and a 3D
train scene. The study session drives the local train's journey end to end —
upload, route, timer, stations, breaks — and narrates it; chat presence adds
companion trains that stop at their own stations and carries each rider's
avatar and banked focus time for the live leaderboard. React on the front,
Bun on the back, SQLite (via `bun:sqlite`) for profiles, chat, conductor route
plans, and study-session history. Typing capture is not implemented yet.

`architecture.md` in this directory has the package map and feature
boundaries. Read it before adding code.

## Layout

- `apps/web/` — Vite + React + TypeScript. Tailwind v4, shadcn/ui,
  react-three-fiber, react-router.
- `apps/api/` — Bun HTTP server, framework-free (`Bun.serve` routes). SQLite
  via `bun:sqlite`, one local file, nothing to run alongside it.
- `packages/shared/` — zod schemas and types both apps import as
  `@grugchug/shared`.
- `docs/specs/` — design docs, named `YYYY-MM-DD-<topic>-design.md`.
- `docs/plans/` — implementation plans.
- `scripts/` — dev helpers.
- `.env.example` — copy to `apps/api/.env`. `SQLITE_PATH` overrides the
  database location; the default is `apps/api/data/grugchug.sqlite`.

## Commands

All from the repo root.

- `bun install` — install every workspace
- `bun run dev` — web (Vite, :5173) and api (:3000) together; Vite proxies `/api`
- `bun run build` — build both apps
- `bun run test` — `bun test` in every package
- `bun run typecheck` — `tsc` in every package
- `bun run lint` — `biome check .`
- `bun run fmt` — `biome check --write .`
- `bunx shadcn@latest add <component>` — run inside `apps/web`
- `/session?dev` in the browser — dev panel for phases, manual focus, friend
  trains, `skipTimer` (arrive or end a break immediately), and `chatter` (steps
  the local conductor through each registered voice line, one per click)

## Conventions

- Bun for everything: install, run, test, bundle. No npm, no node scripts.
- TypeScript strict everywhere; `tsconfig.base.json` is the single base.
- Web code is organized by feature under `src/features/`. Each feature has an
  `index.ts` that is its only public surface and a top comment stating its
  responsibility. Features do not import each other's internals.
- Anything that crosses the HTTP boundary or lands in SQLite is a zod schema
  in `packages/shared`. Do not redefine shapes in `web` or `api`.
- `apps/web/src/components/ui/` is shadcn output. Regenerate with the CLI
  rather than hand-editing when possible.
- File names are kebab-case. Components are named exports.
- Tests sit next to the code as `*.test.ts(x)` and run offline: no network,
  no disk-backed SQLite (tests open `:memory:`), no webcam.
- `.llm/` is the single source of agent context. Root `AGENTS.md` is a symlink
  into it and root `CLAUDE.md` imports it. Edit the files here, not the root ones.
- `features/world` never imports three.js. It holds intent (trains, phases,
  efficiency, owners, speech, regroup count); motion lives in the scene.
- `features/scene` never writes the world store. Per-frame animation and
  spatial positions live in refs, not React state. All scene tuning values,
  including camera, bounce, drift, and audio gain, live in `constants.ts`.
- The study efficiency score has one home: `features/efficiency`. Sources
  report into it (`report(source, 0..1, { weight, halfLifeMs })`); readers read
  `score` and never recompute their own. Writing into the world store is split
  three ways and nowhere else: `features/session` writes the local train's
  efficiency, banked focus time, and companion trains; `features/speech`
  writes `speech` (utterances); `features/conductor` writes the local train's
  `phase`, through `applyStudyPhase()`, driven by the study session's mode.
  The session route bootstraps the local train and applies profile changes;
  the dev panel also uses world commands directly.
- `features/chat` never reads another feature's store. The session pushes
  focus and focused seconds in with `reportFocus()`, avatar and journey with
  `reportJourney()`, and reads the roster out with `useRoster()`.
  Shared browser identity lives in `src/lib/user-id.ts`, not in a feature.
- `features/session/focus-time.ts` banks today's focused seconds from the
  shared efficiency score and persists the daily total in localStorage.
  `features/leaderboard` reads the world store only; it never recomputes focus
  or accumulates time. Presence focus updates must retain avatar/journey,
  and journey updates must retain banked focus time.
- The study session's `passed` mode keeps the train stopped and displays quiz
  feedback until the learner continues. Its station index already points to
  the next station; presence must report the previous stop while reviewing.
  Keep narration, quiz efficiency, and history recording when changing these
  transitions. `skipTimer()` uses the same arrival path as an expired timer.
- Gaze uses one shared tracker per page. Keep its continuous detection loop
  running across UI sampling; StrictMode must not start a second camera.
- Preserve field ownership when applying presence: chat can update the local
  display name, but must keep the profile's selected passenger sprite.
  Friend focus/name updates must retain active `speech`; only the speech
  driver decides when a line ends. Cover these rules in session tests.
- All rails and scenery scroll with the local train. Companion trains move
  relative to that shared world; do not give their tracks independent scroll.
  Every lane spawns its own stations: a companion's motion is registered so
  its lane can place a platform where it halts. `regroup()` resets relative
  motion when new participants arrive.
- Character sprites are 500x500 PNGs with transparent margins in
  `apps/web/public/characters/`. Every sprite maps whole onto the same square
  plane, so how much canvas a drawing fills is how big it is in the world.
  The fixed conductor rides the locomotive; the selected avatar rides the cart.
  Conductor bounce must stay at or above its resting height.
- `train.speech` is set by `say` and cleared by the speech driver through
  `clearSpeech(trainId, speechId)`, so an old clip cannot clear a newer line.
  The scene supplies `createVoiceAudio`, camera/listener updates, and conductor
  positions; speech owns playback/fallback timers and disposes the output on
  unmount. Keep rendering separate from playback lifetime and world writes.
- Profile GET/PUT requests have a timeout: session boarding waits for profile
  success or failure and falls back to the default avatar on failure. Keep
  local-train creation idempotent under React StrictMode.
- Adding a character: add its id to `avatarIdSchema` in shared, its PNG to
  `apps/web/public/characters/`, its name to `features/profile/avatars.ts`, and
  update the schema/picker tests. Do not change the shared canvas convention.
- Adding a voice line: put the clip in `apps/web/public/audio/`, register it in
  `features/speech/lines.ts`, and wire a trigger: a `sayLine(id)` call at the
  moment in `features/conductor/study-session.ts` that calls for it, or a
  `sayText(text)` call for a line with no recording. A committed recording
  alone does not play automatically. Use accurate captions when transcripts
  are available; existing registry captions are placeholders.
- Conductor API tools use `conductor/harness.ts` and `provider/index.ts` for
  validation, retries, provider/model selection, and fixture fallback. Keep
  model names in environment configuration and dependencies injectable so
  tests never call LLMs or touch a real database. Public responses must strip
  answer keys.
- Reuse `apps/api/src/routes/http.ts` for caller IDs, JSON/schema validation,
  and problem responses; preserve each route's existing error format.
- Study-history requests send the browser ID in `CHAT_USER_HEADER`. Require
  it to match the requested user or stored session owner for reads and writes.
  This remains placeholder identity, not authentication. History writes must
  not block studying; dashboard read failures must remain visible.
