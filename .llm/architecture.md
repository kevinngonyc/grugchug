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
| `src/routes/` | One file per page: dashboard, session, settings, the invite landing page (which joins and redirects), and redirects from the old `/chat` links into the session |
| `src/features/gaze/` | Webcam eye tracking: calibration, gaze estimates, attention metrics. Emits `GazeSample` |
| `src/features/typing/` | Keystroke timing and corrections, never key contents. Emits `TypingSample` |
| `src/features/world/` | zustand store of trains, owners, phases, efficiency; command API every driver uses. No three.js; commands include setLocalTrainId and regroup |
| `src/features/scene/` | react-three-fiber rendering of the world store: one scrolling lane per train, stations, scenery, sprites. Never writes the store |
| `src/features/efficiency/` | The study efficiency score: 0..100, a weighted blend of whatever is reporting. Pure scoring in `score.ts`, attention averaging in `attention.ts`, one zustand store |
| `src/features/session/` | Starts and stops a session, gathers samples from gaze and typing, sends them to the API. The only writer into the world: the score becomes the local train's efficiency, and the chat roster becomes the trains in the lanes beside it |
| `src/features/chat/` | The one room you are in, live messages over a WebSocket, history from the API, and the roster of who is connected. Drawn as an overlay inside the session, not as a page; owns its own identity in `localStorage` |
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

`chat` sits beside that flow rather than in it, and still reads nothing from
the rest of the app. Two threads cross the boundary, both driven from
`session`, both one-way:

- `session` calls `chat`'s `reportFocus()` on the same tick that drives the
  local train, and the open socket carries the number to the room. `chat`
  throttles it and otherwise treats it as an opaque value.
- `session` reads `chat`'s `useRoster()` and turns it into trains
  (`use-party-trains.ts`), so `world` still has exactly one writer.

`ChatOverlay` is chat's only visible surface: a bubble in the corner of the
session that opens a panel over the scene. There is nothing to route to and
nothing to pick — one room, resolved on mount. The panel stays mounted while
it is closed, because the socket is what tells the room you are here. Ordering
and de-duplication live in `message-log.ts`, and the roster-to-trains rules in
`features/session/party.ts`; both are pure and tested without a socket or a
server.

## apps/api

| Path | Responsibility |
|---|---|
| `src/index.ts` | `Bun.serve` with a `routes` table under `/api`, plus the `websocket` handler |
| `src/routes/` | One file per resource, exporting plain request handlers |
| `src/chat/store.ts` | Chat's MongoDB access: `chatRooms`, `chatMembers`, `chatMessages` |
| `src/chat/hub.ts` | The `WebSocketHandler`: one pub/sub topic per room, plus the live roster of open sockets per room |
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
| `chatMember` | A `(roomId, userId)` membership, the display name it uses, and when it last came in through a link |
| `chatPresenceMember` | Someone connected right now: who they are and their 0..1 study score. Never stored |
| `chatMessage` | One message, with the sender's display name denormalized onto it |
| `clientChatEvent` / `serverChatEvent` | The WebSocket wire protocol, as discriminated unions |

## Chat

Rooms are the only unit of access: being a member of one is what lets you read
and post, and the invite code is what makes you a member. A browser is in
exactly one room — the one it most recently entered — so there is no room list,
no picker, and no joining by typing a code. Asking for your room is what
creates it the first time; an invite link is the only way into someone else's.

```
POST /api/chat/room             the room you are in, created on first ask
POST /api/chat/rooms/join       enter a room from an invite link
GET  /api/chat/rooms/:roomId/messages   history, newest page first, `before` pages back
GET  /api/chat/ws?roomId&userId WebSocket upgrade, after a membership check
```

`chatMembers.joinedAt` is when a membership last came in through a link, not
when it was created. It is what decides which room you are in, so following a
link you have followed before moves you back to that room.

### Presence

The set of open sockets in a room *is* the roster: nothing is stored, so
someone who closes the tab is gone and a restart starts everyone empty. Any
change — an arrival, a departure, a rename, a new focus score — broadcasts the
whole roster to everyone in the room, sent socket by socket rather than
published to the topic, because the person who just arrived needs it too.

Riders carry their study score on the roster, and the browser turns each rider
into a train in the lane beside yours. `features/scene` scrolls every lane with
the local train so the rails and scenery stay in step; a friend's train runs its
own speed on top of that, so a difference in focus shows up as a gap along the
track. Nothing caps that gap, so a friend who is well ahead or well behind
leaves the frame entirely and a `DriftMarker` takes their place: an arrowhead
that rides the edge of the picture, pointing the way they went. The marker is
placed against the camera frustum every frame rather than at a world position,
which is what keeps it on the edge when the window is resized.

A gap only means something while the two trains disagree about speed, so while
they agree it eases shut (`driftClosing`) and someone lost during a bad stretch
comes back during the next lull. Someone new arriving calls `regroup()`: every
train's speed drops to nothing and every companion is placed level with its
lane again, so a newcomer meets a line that is together rather than strung out
over a kilometre.

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
- Multiplayer transport: friends' trains ride on chat presence, which is
  enough for "who is studying with me" but is not a world sync — nobody's
  phase, station or scroll position crosses the wire, and `applySnapshot` is
  still unused.
- Conductor sprite: `apps/web/public/characters/conductor.png` is committed but unplaced. Once the Gemini conductor agent exists it can stand on the platform or ride the cab via the same `Character` component.
