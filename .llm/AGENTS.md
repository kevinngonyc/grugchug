# grugchug

Study buddy web app. Webcam head pose drives a study-focus score and a 3D
train scene. Chat presence adds companion trains; conductors speak through
spatial audio, and users choose passenger avatars. React on the front, Bun
on the back, MongoDB for profiles, chat, and conductor route plans. Typing
capture and session-history persistence are not implemented yet.

`architecture.md` in this directory has the package map and feature
boundaries. Read it before adding code.

## Layout

- `apps/web/` — Vite + React + TypeScript. Tailwind v4, shadcn/ui,
  react-three-fiber, react-router.
- `apps/api/` — Bun HTTP server, framework-free (`Bun.serve` routes). MongoDB
  via the official driver.
- `packages/shared/` — zod schemas and types both apps import as
  `@grugchug/shared`.
- `docs/specs/` — design docs, named `YYYY-MM-DD-<topic>-design.md`.
- `docs/plans/` — implementation plans.
- `scripts/` — dev helpers.
- `compose.yaml` — local MongoDB. `docker compose up -d`.
- `.env.example` — copy to `apps/api/.env`.

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
  trains, and `chatter` (replays the local departure voice line)

## Conventions

- Bun for everything: install, run, test, bundle. No npm, no node scripts.
- TypeScript strict everywhere; `tsconfig.base.json` is the single base.
- Web code is organized by feature under `src/features/`. Each feature has an
  `index.ts` that is its only public surface and a top comment stating its
  responsibility. Features do not import each other's internals.
- Anything that crosses the HTTP boundary or lands in MongoDB is a zod schema
  in `packages/shared`. Do not redefine shapes in `web` or `api`.
- `apps/web/src/components/ui/` is shadcn output. Regenerate with the CLI
  rather than hand-editing when possible.
- File names are kebab-case. Components are named exports.
- Tests sit next to the code as `*.test.ts(x)` and run offline: no network,
  no MongoDB, no webcam.
- `.llm/` is the single source of agent context. Root `AGENTS.md` is a symlink
  into it and root `CLAUDE.md` imports it. Edit the files here, not the root ones.
- `features/world` never imports three.js. It holds intent (trains, phases,
  efficiency, owners, speech, regroup count); motion lives in the scene.
- `features/scene` never writes the world store. Per-frame animation and
  spatial positions live in refs, not React state. All scene tuning values,
  including camera, bounce, drift, and audio gain, live in `constants.ts`.
- The study efficiency score has one home: `features/efficiency`. Sources
  report into it (`report(source, 0..1, { weight, halfLifeMs })`); readers read
  `score` and never recompute their own. `features/session` drives efficiency
  and party trains; `features/speech` owns utterances. The session route
  bootstraps the local train and applies profile changes; the dev panel also
  uses world commands directly.
- `features/chat` never reads another feature's store. The session pushes
  focus in with `reportFocus()` and reads the roster out with `useRoster()`.
  Shared browser identity lives in `src/lib/user-id.ts`, not in a feature.
- Preserve field ownership when applying presence: chat can update the local
  display name, but must keep the profile's selected passenger sprite.
  Friend focus/name updates must retain active `speech`; only the speech
  driver decides when a line ends. Cover these rules in session tests.
- All rails and scenery scroll with the local train. Companion trains move
  relative to that shared world; do not give their tracks independent scroll.
  Stations belong to the local lane. `regroup()` resets relative motion when
  new participants arrive.
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
  `features/speech/lines.ts`, and wire a trigger through `say`. A committed
  recording alone does not play automatically. Use accurate captions when
  transcripts are available; existing registry captions are placeholders.
- Conductor API tools use `conductor/harness.ts` and `provider/index.ts` for
  validation, retries, provider/model selection, and fixture fallback. Keep
  model names in environment configuration and dependencies injectable so
  tests never call LLMs or MongoDB. Public responses must strip answer keys.
