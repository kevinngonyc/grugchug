# Architecture

## Packages and runtime

```
apps/web ── HTTP /api + WebSocket /api/chat/ws ──> apps/api ──> MongoDB
    │                                               │
    └────────────── packages/shared ────────────────┘
                    zod schemas and types
```

The web app is Vite + React + TypeScript. The API uses framework-free
`Bun.serve` routes and the official MongoDB driver. Vite proxies HTTP and
WebSocket traffic under `/api` to port 3000; the frontend normally runs on
5173. Configure the API through `apps/api/.env` using `.env.example`.

The current session runs the train scene, webcam attention tracking, profile
selection, conductor speech, and room chat. Typing capture and persisted
study-session history remain future work; their shared schemas exist.

## Web package map

Paths below are relative to `apps/web/`. Features expose their public surface
through `src/features/<feature>/index.ts`.

| Path | Responsibility |
|---|---|
| `src/app.tsx`, `src/routes/` | Dashboard, session, Settings, invite landing page, and redirects from old chat URLs |
| `src/features/gaze/` | `@webgazer-ts/core` head-pose tracking; `Gaze` reports a per-sample `onFacing` boolean. One shared tracker per page; WebGazer's per-frame loop is paused and one face estimate is requested per 200 ms sample. Webcam preview and diagnostics are dev-only |
| `src/features/typing/` | Shared `TypingSample` type export; no capture implementation yet |
| `src/features/efficiency/` | One weighted, aging score from 0 to 100; attention averaging and source signals |
| `src/features/session/` | Drives local efficiency, banks today's focused time (`focus-time.ts`, score/100 per second, per day in localStorage), sends both to chat, and maps the chat roster to companion trains |
| `src/features/leaderboard/` | `FocusBoard`, top-left: every rider's avatar ringed by live focus in a per-player colour, and a leaderboard of focused time. Reads the world store only; hidden while the conductor panel is open |
| `src/features/world/` | Zustand train intent: owners, phases, efficiency, speech, local train ID, and regroup count. No three.js |
| `src/features/profile/` | Loads/saves the browser's profile, defines the avatar catalog, and renders the Settings picker |
| `src/features/speech/` | Voice-line registry, phase announcements for the local train (start, break, restart, finish), `sayLine` for events the world does not see, playback/fallback timing, and clearing finished utterances |
| `src/features/scene/` | Train models, shared scrolling environment, relative companion motion, stations, sprites, speech bubbles, and positional audio output. Reads world state only |
| `src/features/chat/` | The current room, messages, identity/display name, invite links, socket lifecycle, and live roster |
| `src/lib/user-id.ts` | Browser-generated ID in localStorage, shared by profile and first-time chat requests |
| `src/components/ui/` | shadcn-generated components |
| `src/styles/index.css` | Tailwind imports and shared styling |
| `public/models/` | Kenney GLBs and the Train Kit texture atlas |
| `public/characters/`, `public/audio/` | Transparent avatar PNGs and conductor recordings |

## State ownership and data flow

```
Gaze.onFacing ──> efficiency ──> session ──> world ──> scene
                                  │          ▲
                                  │          │ say / clearSpeech
                                  │        speech <── scene audio output
                                  │
                                  ├── reportFocus ──> chat socket
                                  └── roster <────── chat socket

profile ──> session route ──> local train owner
```

`features/efficiency` is the only source of the score. Sources report a 0..1
value with a weight and optional half-life. The score is the weighted mean,
scaled to 0..100; stale signals lose weight and eventually expire. Attention
is the live input today. Quiz, typing, and pacing are possible future inputs;
the dev panel can supply a manual override.

`useEfficiencyDrive` ticks every 500 ms, ages the signals, updates local train
efficiency, and calls chat's throttled `reportFocus()`. Low focus slows the
train; it does not stop it. Stops are explicit phase changes.

The session route creates the local train running after the profile reaches
`ready` or `error`, with a live-store guard for StrictMode. It applies later
avatar changes. `usePartyTrains` consumes chat's roster and calls
`syncPartyTrains` to update companions. Presence can change the local chat
name but preserves the selected passenger; companion updates preserve any
active speech. The dev panel also drives world commands directly.

Chat reads no other feature's store. Session is the bridge for focus and
presence. World commands express intent; scene motion stays in refs. Speech
is a separate driver that reads utterances and clears only the matching ID
when playback or its fallback timer finishes.

## Profiles and identity

`GET /api/users/:id` loads a profile; `PUT /api/users/:id` upserts name and
avatar. Both routes validate IDs with the shared 1–64 character `userIdSchema`.
`userProfileSchema` validates PUT bodies. Creation time is preserved on update.
The frontend bounds each request to three seconds so a stalled API cannot
prevent the local train from boarding. Failed loads use Poku; failed saves
retain the last loaded profile.

The selectable avatars are Conductor, Bonbon, Poku, Cat, and Doug. They are
passengers on the carriage. Every locomotive separately uses the fixed
`conductor.png` as the speaking agent. Images share a 500x500 transparent
canvas and a common plane size; the visible drawing determines world size.

New chat requests use the shared browser ID when no chat identity exists.
Browsers with older chat identities retain those IDs; there is no migration
that unifies an existing chat identity with a newer profile. Chat names are
editable independently of the profile name. Companion sprites are currently
assigned from user IDs: selected avatars are not transmitted in presence.

## Scene and voice playback

`TrainWorld` owns the canvas and shared local travel. Every lane's rails,
scenery, and platforms use that travel. Only the local lane creates stations.
Each companion train has its own speed and moves along its track relative to
the local train; its wheels and smoke use that speed. Whole multi-axle bogies
stay fixed, while individual wheel meshes spin.

Relative gaps close gradually when speeds converge. New roster participants
call `regroup()`, resetting speed and lining companions up again. A companion
outside the camera frame is represented by `DriftMarker`; `framing.ts`
computes the visible width from the current camera and viewport.

The closer camera views the trains from the negative-z side; lanes extend in
positive z. Camera, spacing, drift, bounce, and audio tuning values live in
`features/scene/constants.ts`. Conductor bounce is upward-only so it cannot
dip below the resting point into the roof. Sprites billboard toward the
camera, and speech bubbles follow the conductor.

`useSpeechPlayer(createVoiceAudio)` connects the driver to the scene's audio
adapter. The adapter routes media elements through HRTF panners, inverse
distance attenuation, and reduced gain. `VoiceListener` follows the camera;
`Character` publishes each conductor's actual world position, including bob
and companion drift. Audio nodes are disconnected when a line ends, is
replaced, or its train disappears; the context closes on session unmount.

The departure announcer uses `VOICE_LINES.startSession` when the local train
first appears running or transitions back to running. Returning to a session
with an already-running train does not announce again. `/session?dev` exposes
`chatter`: the local conductor plays the departure clip, while friends get
canned text. Text-only, failed, or autoplay-blocked clips use a text-duration
fallback. A gesture can unlock audio for subsequent playback.

Five recordings are committed. `startSession`, `greatSession`, and `passQuiz`
are registered; only the first has an automatic trigger. `restart_study1.mp3`
and `take_break1.mp3` are assets awaiting registration and triggers. Registry
captions are placeholders pending transcripts. The conductor API does not
yet drive client speech or generate voice clips.

## Chat and multiplayer

`ChatOverlay` opens a panel over the session. The panel stays mounted while
closed to retain its socket and presence. There is one current room per
browser: requesting it creates one if needed, and an invite link joins
someone else's. The latest `chatMembers.joinedAt` determines the current room.

| Endpoint | Purpose |
|---|---|
| `POST /api/chat/room` | Resolve or create the caller's current room |
| `POST /api/chat/rooms/join` | Join via an invite link |
| `GET /api/chat/rooms/:roomId/messages` | Paginated history; accepts `before` |
| `GET /api/chat/ws?roomId&userId` | Upgrade after checking room membership |

HTTP uses `CHAT_USER_HEADER`; the socket passes identity in its query string.
The server validates events and rate-limits each socket. Messages persist in
MongoDB; live presence is the set of connected sockets and is not stored.
Roster entries contain user ID, display name, 0..1 efficiency, and the
focused seconds that user's client has banked today (each client counts its
own and relays it, so every leaderboard agrees). Multiple tabs for one user
produce one rider; the newest connection's reading wins.

Presence changes broadcast the roster. Session renders at most four companion
trains, excluding self, in roster order. Only presence and focus cross this
boundary: train phases, positions, selected avatars, and speech do not.
`applySnapshot` remains available in the world store but is not the chat
transport. Message ordering, optimistic reconciliation, and de-duplication
live in `message-log.ts`.

## API package map

Paths below are relative to `apps/api/`.

| Path | Responsibility |
|---|---|
| `src/index.ts` | HTTP route table and WebSocket handler |
| `src/db.ts` | Lazy connection from `MONGODB_URI` |
| `src/routes/users.ts`, `src/users-repo.ts` | Validated profiles; Mongo repository and an in-memory test implementation |
| `src/routes/chat.ts` | Room resolution, joins, history, and socket upgrade |
| `src/chat/store.ts` | `chatRooms`, `chatMembers`, and `chatMessages` collections |
| `src/chat/hub.ts` | Per-room socket topics, message/focus/rename events, and in-memory presence |
| `src/chat/rate-limit.ts`, `src/chat/errors.ts` | Per-connection throttling and request failure reporting |
| `src/routes/conductor.ts` | Plan creation/retrieval, answer grading, and questions |
| `src/conductor/tools/` | Plan stations, generate questions, grade answers, and answer study questions |
| `src/conductor/harness.ts` | Validated tool execution, content-hash cache, timeouts, retries, confidence checks, traces, and fixtures |
| `src/conductor/provider/` | Gemini/Groq adapters and central vendor/model selection |
| `src/conductor/pdf.ts`, `src/conductor/material-parts.ts` | Material conversion; local PDF text extraction for Groq |
| `src/conductor/store.ts` | MongoDB `routePlans` persistence with schema validation on read |

## Conductor API

| Endpoint | Purpose |
|---|---|
| `POST /api/conductor/plans` | Turn text/PDF study material into a persisted plan |
| `GET /api/conductor/plans/:id` | Read the public plan without answer keys |
| `POST /api/conductor/stations/:stationId/answer` | Grade a submitted answer |
| `POST /api/conductor/ask` | Answer a question about the study material |

Plan creation first produces station outlines, then generates questions for
stations in parallel and persists the assembled route. MCQ grading is local;
short answers and study questions use tools. Public schemas strip answer keys
before returning plans to the browser.

Tools run through the harness: a flash-tier attempt plus up to two retries,
then one pro-tier escalation, then a fixture if all attempts fail. Tools that
request confidence checks use the configured threshold (currently 0.6).
Successful results are cached by tool name/input. Provider calls have bounded
waiting and trace records. Fixture fallback does not replace MongoDB: plan
persistence still requires a reachable database.

`provider/index.ts` selects Gemini or Groq through `LLM_PROVIDER` and reads the
vendor's API key and flash/pro model variables. Gemini receives PDF bytes;
Groq receives locally extracted PDF text. Tests inject tool/provider/store
dependencies and never contact these services.

## Shared contracts

`packages/shared` exports zod schemas and inferred types used across HTTP,
WebSockets, and persistence. Web/API code imports `@grugchug/shared`.

| Schema family | Contents |
|---|---|
| `user` | Avatar IDs, user record, and editable profile body |
| `chat` | User-ID bound, rooms, memberships, messages, presence, request/response bodies, and socket events |
| `train` | Train owner/phase/efficiency/lane, optional speech, and world snapshots |
| `efficiency` | Weighted source signals, half-life, timestamps, and score limits |
| `conductor` | Material, route plans, stations, questions, grading/ask bodies, and public variants without answer keys |
| `session`, `gaze`, `typing` | Contracts for future session/sample persistence; typing capture is not implemented |

## Remaining gaps

- Browser IDs and room membership are placeholders for authentication; they
  are not verified accounts. Profile and chat identity migration is pending.
- The live attention signal is based on head pose, not a calibrated measure
  of reading comprehension. Typing capture, session history, and automatic
  quiz-to-efficiency reporting are not wired up.
- The frontend does not yet connect conductor plans/questions to the scene's
  stations, quizzes, or speech commands.
- Selected avatars and speech are not synchronized to other clients. A future
  snapshot transport must also handle re-delivered, already-finished speech.
