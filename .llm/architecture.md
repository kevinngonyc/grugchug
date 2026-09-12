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
| `src/routes/` | One file per page: dashboard, session, settings, the invite landing page, and redirects from the old `/chat` links into the session |
| `src/features/gaze/` | Webcam eye tracking: calibration, gaze estimates, attention metrics. Emits `GazeSample` |
| `src/features/typing/` | Keystroke timing and corrections, never key contents. Emits `TypingSample` |
| `src/features/world/` | zustand store of trains, phases, efficiency; command API every driver uses. No three.js; commands include setLocalTrainId |
| `src/features/scene/` | react-three-fiber rendering of the world store: one scrolling lane per train, stations, scenery, sprites. Never writes the store |
| `src/features/efficiency/` | The study efficiency score: 0..100, a weighted blend of whatever is reporting. Pure scoring in `score.ts`, attention averaging in `attention.ts`, one zustand store |
| `src/features/session/` | Starts and stops a session, gathers samples from gaze and typing, sends them to the API. Drives the world: the score becomes the local train's efficiency |
| `src/features/chat/` | Rooms you invite people into, live messages over a WebSocket, history from the API. Drawn as an overlay inside the session, not as a page; owns its own identity and its active room in `localStorage` |
| `src/components/ui/` | shadcn components |
| `src/components/` | App-level shared components |
| `src/lib/` | Utilities, including shadcn's `cn` |
| `src/styles/index.css` | Tailwind import, theme tokens, shadcn variables |
| `public/models/` | `.glb` assets for the scene plus the Train Kit texture atlas they reference |

Data flows one way: `gaze` and `typing` produce samples, those samples become
signals in `efficiency`, `session` collects and persists them and drives
`world` commands from the score, `scene` renders `world`.
`world` is pure TypeScript, so anything can drive it without WebGL: the
session timer, a tracking score, an agent tool call routed through the API,
or a multiplayer sync calling `applySnapshot`.

`chat` sits beside that flow rather than in it: it never reads gaze, typing or
session state, and nothing reads chat. `ChatOverlay` is its only public
surface — a bubble in the corner of the session that opens a panel over the
scene — and it is what decides which room is on screen; the room picker and the
room view below it do no routing. Study metrics are not shared between
users. Its ordering and de-duplication rules live in `message-log.ts`, which is
pure, so they are tested without a socket or a server.

## apps/api

| Path | Responsibility |
|---|---|
| `src/index.ts` | `Bun.serve` with a `routes` table under `/api`, plus the `websocket` handler |
| `src/routes/` | One file per resource, exporting plain request handlers |
| `src/chat/store.ts` | Chat's MongoDB access: `chatRooms`, `chatMembers`, `chatMessages` |
| `src/chat/hub.ts` | The `WebSocketHandler`: one pub/sub topic per room |
| `src/chat/ids.ts` | Room ids, invite codes, and the placeholder user id |
| `src/chat/rate-limit.ts` | Per-connection token bucket |
| `src/db.ts` | Lazy MongoDB connection from `MONGODB_URI` |
| `src/routes/conductor.ts` | Conductor endpoints: create/get a route plan, grade answers, ask |
| `src/conductor/` | Turns study material into a route of stations with questions. `fixtures.ts` is the fallback route |

Handlers validate bodies with schemas from `packages/shared` before touching
the database.

## packages/shared

| Schema | Meaning |
|---|---|
| `user` | Account identity |
| `session` | One study sitting, start to stop |
| `gazeSample` | A gaze estimate at time `t`, viewport-normalized `x, y`, `onScreen` |
| `typingSample` | A keystroke at time `t` and whether it was a correction |
| `chatRoom` | A room, its name, and the invite code that grants access |
| `chatMember` | A `(roomId, userId)` membership and the display name it uses |
| `chatMessage` | One message, with the sender's display name denormalized onto it |
| `clientChatEvent` / `serverChatEvent` | The WebSocket wire protocol, as discriminated unions |

## Chat

Rooms are the only unit of access: being a member of one is what lets you read
and post, and the invite code is what makes you a member. There is no friends
list, no presence, and no online/offline state.

```
POST /api/chat/rooms            create a room, get its invite code
POST /api/chat/rooms/join       join by invite code
GET  /api/chat/rooms            rooms you are in
GET  /api/chat/rooms/:roomId    one room, plus your membership
GET  /api/chat/rooms/:roomId/messages   history, newest page first, `before` pages back
GET  /api/chat/ws?roomId&userId WebSocket upgrade, after a membership check
```

HTTP requests identify the caller with the `CHAT_USER_HEADER` header. The
WebSocket cannot set headers, so it passes the same value as a query parameter
and membership is checked before the upgrade; everything after that trusts
`ws.data`. A sender's own message comes back with their `clientId` attached so
the optimistic bubble is replaced rather than duplicated; everyone else's copy
carries `null`.
| `train` | `TrainPhase`, `TrainState` (id, owner, phase, efficiency, lane), `WorldSnapshot` |
| `conductor` | `RoutePlan` of `Station`s with `Question`s, answer and ask bodies. `public*` variants strip answer keys for the browser |

## Efficiency

One number, 0..100, for how well a sitting is going. It is a blend, not a
measurement: every source reports a 0..1 opinion with a weight, and the score
is their weighted mean.

```
gaze ──facing?──> attention signal ─┐
quiz ───score───> quiz signal ──────┼─> weighted mean ─> score 0..100 ─> train efficiency
anything else ──> its own signal ───┘                                 └─> dashboards, summaries, agents
```

```ts
useEfficiency.getState().report("quiz", 0.8, {
  label: "Quiz", weight: 0.5, halfLifeMs: 10 * 60_000,
});
```

Weights are read against attention's `1`, so a source at `0.5` can pull the
score at most a third of the way to its own value. `halfLifeMs` is how fast a
reading goes stale: its weight halves every half-life and is dropped below
1/64, so a one-off result fades on its own while a source that keeps reporting
never does. `null` means it counts until someone drops it.

Readers take the number and nothing else — `efficiencyScore()` outside React,
`useEfficiency((s) => s.score)` inside it, `efficiencyFraction()` for the 0..1
form a train wants. `features/session/use-efficiency-drive.ts` is the only
writer into `world`; it ticks twice a second, which is also what ages the
signals. Nothing reads back out of `world` to get the score.

The local train is created `running` and stays running: the score sets its
speed through `targetSpeed()`, MIN_SPEED at focus 0 up to MAX_SPEED at focus
100, so a bad stretch is slow rather than stuck. Stopping is a separate
decision (a station, the end of a session), not something the score does.

The signal shape is `efficiencySignalSchema` in `packages/shared`, so a score
can cross the wire when sessions are persisted or friends' trains are synced.

## Deferred

- Auth: none yet. `userId` is a plain string — for chat, a long random one the
  server mints and the client stores. It is unguessable, so it behaves like a
  bearer token, but it is not authentication: anyone holding the string is that
  user, and a member who leaves keeps access until the room is rebuilt. Replace
  this wholesale when auth lands; see the chat design doc.
- Gaze library: not chosen. WebGazer.js and MediaPipe Face Mesh are the candidates.
- Server framework: none. Express, Hono, or Elysia can be mounted in `apps/api/src/index.ts`.
- Efficiency inputs: attention is the only source reporting today. The quiz, typing, and session pacing are the obvious next ones, and each is a `report()` call — see "Efficiency" above. `features/world/speed.ts` still maps efficiency to speed linearly.
- Multiplayer transport: a network module that calls `applySnapshot`.
- Conductor sprite: `apps/web/public/characters/conductor.png` is committed but unplaced. Once the Gemini conductor agent exists it can stand on the platform or ride the cab via the same `Character` component.
