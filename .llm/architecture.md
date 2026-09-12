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
| `src/features/world/` | zustand store of trains, phases, efficiency; command API every driver uses. No three.js |
| `src/features/scene/` | react-three-fiber rendering of the world store: one scrolling lane per train, stations, scenery, sprites. Never writes the store |
| `src/features/session/` | Starts and stops a session, gathers samples from gaze and typing, sends them to the API |
| `src/components/ui/` | shadcn components |
| `src/components/` | App-level shared components |
| `src/lib/` | Utilities, including shadcn's `cn` |
| `src/styles/index.css` | Tailwind import, theme tokens, shadcn variables |
| `public/models/` | `.glb` assets for the scene |

Data flows one way: `gaze` and `typing` produce samples, `session` collects
and persists them and drives `world` commands, `scene` renders `world`.
`world` is pure TypeScript, so anything can drive it without WebGL: the
session timer, a tracking score, an agent tool call routed through the API,
or a multiplayer sync calling `applySnapshot`.

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
| `train` | `TrainPhase`, `TrainState` (id, owner, phase, efficiency, lane), `WorldSnapshot` |

## Deferred

- Auth: none yet. `userId` is a plain string.
- Gaze library: not chosen. WebGazer.js and MediaPipe Face Mesh are the candidates.
- Server framework: none. Express, Hono, or Elysia can be mounted in `apps/api/src/index.ts`.
- Efficiency algorithm: `features/world/speed.ts` maps efficiency to speed linearly until tracking has a real score.
- Multiplayer transport: a network module that calls `applySnapshot`.
- Conductor sprite: `apps/web/public/characters/conductor.png` is committed but unplaced. Once the Gemini conductor agent exists it can stand on the platform or ride the cab via the same `Character` component.
