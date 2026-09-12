# Architecture

## Packages

```
apps/web  ──HTTP /api──>  apps/api  ──>  MongoDB
    │                        │
    └───── packages/shared ──┘   zod schemas, the data contract
```

Vite serves the web app and proxies `/api` to the Bun server in dev. In
production the two deploy separately.

## apps/web

| Path | Responsibility |
|---|---|
| `src/app.tsx` | Top-level layout and routes |
| `src/routes/` | One file per page: dashboard, session, settings |
| `src/features/gaze/` | Webcam eye tracking: calibration, gaze estimates, attention metrics. Emits `GazeSample` |
| `src/features/typing/` | Keystroke timing and corrections, never key contents. Emits `TypingSample` |
| `src/features/scene/` | react-three-fiber canvas, train models, animation driven by session metrics |
| `src/features/session/` | Starts and stops a session, gathers samples from gaze and typing, sends them to the API |
| `src/components/ui/` | shadcn components |
| `src/components/` | App-level shared components |
| `src/lib/` | Utilities, including shadcn's `cn` |
| `src/styles/index.css` | Tailwind import, theme tokens, shadcn variables |
| `public/models/` | `.glb` assets for the scene |

Data flows one way: `gaze` and `typing` produce samples, `session` collects
and persists them, `scene` reads session metrics to animate. `gaze` and
`typing` never import `scene`, so they are testable without WebGL.

## apps/api

| Path | Responsibility |
|---|---|
| `src/index.ts` | `Bun.serve` with a `routes` table under `/api` |
| `src/routes/` | One file per resource, exporting plain request handlers |
| `src/db.ts` | Lazy MongoDB connection from `MONGODB_URI` |

Handlers validate bodies with schemas from `packages/shared` before touching
the database.

## packages/shared

| Schema | Meaning |
|---|---|
| `user` | Account identity |
| `session` | One study sitting, start to stop |
| `gazeSample` | A gaze estimate at time `t`, viewport-normalized `x, y`, `onScreen` |
| `typingSample` | A keystroke at time `t` and whether it was a correction |

## Deferred

- Auth: none yet. `userId` is a plain string.
- Gaze library: not chosen. WebGazer.js and MediaPipe Face Mesh are the candidates.
- Server framework: none. Express, Hono, or Elysia can be mounted in `apps/api/src/index.ts`.
- Real train models: the scene renders placeholder boxes until `.glb` files land.
