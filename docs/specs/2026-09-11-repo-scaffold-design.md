# Repository scaffold

Study buddy web app. Tracks a user's eye gaze and typing during study sessions
to measure focus and efficiency, and renders simple 3D scenes (trains) as
feedback. React on the front, Bun on the back, MongoDB for persistence.

## Decisions

- Bun workspaces monorepo: `apps/web`, `apps/api`, `packages/shared`.
- Bun is the runtime, package manager, test runner, and bundler for the API.
- Web: Vite + React + TypeScript, Tailwind v4 (CSS-first config), shadcn/ui,
  react-three-fiber for 3D, react-router for pages.
- API: plain `Bun.serve` with no framework. Express, Hono, or Elysia can be
  added later as a one-file change in `apps/api/src/index.ts`.
- Persistence: official `mongodb` driver. Documents and requests are validated
  with zod schemas from `packages/shared`, so there is one source of truth for
  data shapes. Mongoose can replace the driver later if wanted.
- Eye tracking runs in the browser from the webcam. Which library is deferred.
- Biome for lint and format. `bun test` in every package.

## Layout

```
package.json          workspaces + root scripts
tsconfig.base.json    strict TS shared by all packages
biome.json
compose.yaml          local MongoDB
.env.example
apps/web              Vite React app
apps/api              Bun HTTP server
packages/shared       zod schemas + types
docs/specs, docs/plans, scripts, .llm
```

### apps/web

```
src/
  main.tsx, app.tsx
  routes/            dashboard, session, settings
  components/ui/     shadcn components (owned copies)
  components/        app-level shared components
  features/
    gaze/            webcam gaze source, calibration, attention metrics
    typing/          keystroke capture, speed and accuracy metrics
    scene/           react-three-fiber canvas, train models, animation
    session/         study-session state; wires tracking to the API
  lib/               api client, cn(), utilities
  styles/index.css   Tailwind import + theme + shadcn variables
public/models/       .glb assets
```

Each feature folder has one public entry (`index.ts`) and keeps its hooks,
components, and tests inside. `gaze` and `typing` produce plain metric objects
so they are testable without a canvas or webcam.

### apps/api

```
src/
  index.ts     Bun.serve, mounts routes under /api
  db.ts        lazy MongoDB connection from MONGODB_URI
  routes/      one file per resource
```

### packages/shared

```
src/schemas/   zod: user, session, gazeSample, typingSample
src/index.ts
```

## Commands (root)

- `bun install`
- `bun run dev` — web and api together
- `bun run build`, `bun run test`, `bun run lint`, `bun run fmt`, `bun run typecheck`

## Testing

- `bun test` per package, run from root via `bun run test`.
- Tests colocated as `*.test.ts(x)`.
- Web component tests use happy-dom. The 3D scene is not unit tested.

## Out of scope

Auth, the actual gaze and typing algorithms, real train models, deployment.
