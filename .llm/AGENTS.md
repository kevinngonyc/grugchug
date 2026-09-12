# grugchug

Study buddy web app. Tracks a user's eye gaze and typing during study sessions
to measure focus and efficiency, and renders simple 3D scenes (trains) as
feedback. React on the front, Bun on the back, MongoDB for persistence.

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
- `/session?dev` in the browser — dev panel to drive trains by hand

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
- `features/world` never imports three.js. `features/scene` never writes the
  store. Per-frame animation state lives in refs, not React state.
- Scene numbers live in `features/scene/constants.ts`. Tune there, not inline.
- Character sprites are 500x500 PNGs with transparent margins in
  `apps/web/public/characters/`. Every sprite maps whole onto the same square
  plane, so how much canvas a drawing fills is how big it is in the world.
