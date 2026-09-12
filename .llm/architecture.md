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
| `src/routes/` | One file per page: dashboard, session, chat, chat-room, chat-join, settings |
| `src/features/gaze/` | Webcam eye tracking: calibration, gaze estimates, attention metrics. Emits `GazeSample` |
| `src/features/typing/` | Keystroke timing and corrections, never key contents. Emits `TypingSample` |
| `src/features/scene/` | react-three-fiber canvas, train models, animation driven by session metrics |
| `src/features/session/` | Starts and stops a session, gathers samples from gaze and typing, sends them to the API |
| `src/features/chat/` | Rooms you invite people into, live messages over a WebSocket, history from the API. Owns its own identity in `localStorage` |
| `src/components/ui/` | shadcn components |
| `src/components/` | App-level shared components |
| `src/lib/` | Utilities, including shadcn's `cn` |
| `src/styles/index.css` | Tailwind import, theme tokens, shadcn variables |
| `public/models/` | `.glb` assets for the scene |

Data flows one way: `gaze` and `typing` produce samples, `session` collects
and persists them, `scene` reads session metrics to animate. `gaze` and
`typing` never import `scene`, so they are testable without WebGL.

`chat` sits beside that flow rather than in it: it never reads gaze, typing or
session state, and nothing reads chat. Study metrics are not shared between
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

## Deferred

- Auth: none yet. `userId` is a plain string — for chat, a long random one the
  server mints and the client stores. It is unguessable, so it behaves like a
  bearer token, but it is not authentication: anyone holding the string is that
  user, and a member who leaves keeps access until the room is rebuilt. Replace
  this wholesale when auth lands; see the chat design doc.
- Gaze library: not chosen. WebGazer.js and MediaPipe Face Mesh are the candidates.
- Server framework: none. Express, Hono, or Elysia can be mounted in `apps/api/src/index.ts`.
- Real train models: the scene renders placeholder boxes until `.glb` files land.
