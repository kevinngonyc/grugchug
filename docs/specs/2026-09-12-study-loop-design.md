# The study loop, together

Ties the pieces that already exist into one journey. The conductor's study
session (upload, route, timer, station, answer, break, next station,
complete) drives the train and narrates itself; quizzes feed the focus score;
finishing pulls into a terminus and is remembered; and the people in your
chat room ride beside you with their real avatars, stop at their own
stations, and show where they are on their route.

Builds on the train world, conductors, chat, efficiency, and the conductor's
Stage C state machine. Storage is `2026-09-12-sqlite-storage-design.md`.

## Decisions

- The study session is the source of truth for the local train's phase. One
  pure projection replaces the scattered `setPhase` calls, and it also runs on
  resume from localStorage.
- The train waits at the platform until Start studying. "Starting" is a real
  moment with the all-aboard clip, and idle trains stand at a station instead
  of running to nowhere.
- Narration belongs to the loop, not to phase changes. The phase-based
  announcer is removed; the study session says lines at the moments only it
  knows. `features/speech` stays the only writer of utterances through its
  public `sayLine` and `sayText`.
- Quiz results are one more efficiency signal, reported through
  `features/efficiency`'s public `report`, never a second score.
- Presence carries the journey. The chat roster entry gains the rider's
  avatar and where they are on their route. Chat still reads nothing from the
  rest of the app; `features/session` pushes the status in and maps the roster
  to trains, as it does for focus.
- Friends' trains stop at their own stations. A companion's motion is
  registered like the leader's so its lane can spawn a platform where it will
  halt, and the catch-up drift pauses while it rests there.
- History is recorded, not reconstructed: the loop posts start, each station
  verdict, and the end to the API as they happen.

## Shared schemas (`packages/shared`)

```ts
JourneyState   = "idle" | "studying" | "at-station" | "answering" | "on-break" | "finished"
Journey        = { state: JourneyState; station: { index: number; total: number } | null }
ChatPresenceMember += { avatar?: AvatarId; journey?: Journey }   // absent from older clients
ClientChatEvent += { type: "journey"; avatar: AvatarId; journey: Journey }

StudySession   = { id, userId, planId, stationTotal, startedAt, endedAt: string | null,
                   outcome: "completed" | "quit" | null }
StationResult  = { sessionId, stationIndex, stationId, passed, meanScore: 0..1, recordedAt }
StudySessionSummary = StudySession & { stationsPassed: number }
StartStudySessionRequest  = { userId, planId, stationTotal }
StationResultRequest      = { stationIndex, stationId, passed, meanScore }
EndStudySessionRequest    = { outcome: "completed" | "quit" }
```

`session.ts` is replaced by these; the old `sessionSchema` had no consumer.

## Loop drives the train (`apps/web/src/features/conductor`)

| File | Change |
|---|---|
| `study-drive.ts` | New. `phaseForMode(mode): TrainPhase` — `counting` → `running`; `complete` → `finished`; everything else → `stopped`. `journeyForSession(state): Journey` — idle → idle; counting → studying; at-station → at-station; answering → answering; on-break → on-break; complete → finished; station is `{ index: stationIndex + 1, total: plan.stations.length }` when a plan exists, else null. `useStudyDrive()` subscribes to `useStudySession` and applies `setPhase(localTrainId, phaseForMode(mode))` whenever the mode or the local train id changes |
| `study-session.ts` | All inline `setPhase` calls removed. Narration added: `startStudying` → `sayLine("startSession")` for a fresh plan and `sayLine("restartStudy")` when resuming after a break or a passed station; `tick` reaching a station → `sayText("Now arriving: <station title>")`; `tick` ending a break → `sayText("Break's over.")`; `chooseBreak` → `sayLine("takeBreak")`; `chooseKeepStudying` → `sayLine("restartStudy")`; a passed station → `sayLine("passQuiz")` and the departure that follows stays silent; `complete` → `sayLine("greatSession")`. Grading also reports the station's mean score to efficiency as source `"quiz"`, label "Quiz", weight 0.5, half-life 10 minutes. History calls (below) at start, each verdict, complete, and quit |
| `conductor-overlay.tsx` | Mounts `useStudyDrive()` beside the existing hydrate and tick effects |
| `session-storage.ts` | `PersistedSession` gains `historyId: string \| null` so a resumed session keeps writing to the same history record |
| `index.ts` | Also exports `journeyForSession` and `phaseForMode` for `features/session` |

`routes/session.tsx` creates the local train `stopped` and no longer mounts
`useDepartureAnnouncer`. `features/speech` loses `departure.ts` and its hook,
and gains `sayText(text)` (text-only bubble on the local conductor). The dev
panel keeps chatter and its phase buttons.

## Quiz to focus

After every question at a station is graded, `useEfficiency.getState().report("quiz", mean, { label: "Quiz", weight: 0.5, halfLifeMs: 600_000 })`
where `mean` is the average `score` of the station's results. A good station
speeds the train for a while; it fades on its own like any signal.

## History (`apps/api`, `apps/web`)

Routes, all validated with the shared schemas, backed by `study/store.ts`:

```
POST /api/study-sessions                 StartStudySessionRequest → StudySession
POST /api/study-sessions/:id/stations    StationResultRequest     → StationResult
POST /api/study-sessions/:id/end         EndStudySessionRequest   → StudySession
GET  /api/study-sessions?userId=         → StudySessionSummary[] (newest first, 20)
```

`features/conductor/history.ts` wraps them (`fetchFn` injectable, 3 s
timeout, failures logged and swallowed: history must never block studying).
The study session stores the current `historyId` in its persisted state so a
resumed session keeps writing to the same record. `quit` ends it as `quit`;
`complete` ends it as `completed`.

`routes/dashboard.tsx` lists the browser user's recent sessions: date, stations
passed of total, duration, outcome. Rendered from `features/conductor`'s new
`SessionHistory` component so the route stays a shell.

## Presence carries the journey

| Where | Change |
|---|---|
| `apps/api/src/chat/hub.ts` | Socket data gains `avatar` and `journey`; a `journey` client event stores both and broadcasts presence, like `focus`. Roster entries include them |
| `apps/web/src/features/chat/journey-link.ts` | New, mirrors `focus-link.ts`: `setJourneySink`, `reportJourney({ avatar, journey })`. Deduplicates identical statuses; no throttle, changes are rare. A fresh sink resends the last status |
| `apps/web/src/features/chat/use-chat-room.ts` | Registers the journey sink alongside the focus sink |
| `apps/web/src/features/chat/index.ts` | Exports `reportJourney` |
| `apps/web/src/features/session/use-journey-link.ts` | New. Reads `useStudySession` (mode, stationIndex, plan) and `useProfile` (avatar) and calls `reportJourney(...)` on change |
| `apps/web/src/features/session/party.ts` | `partyTrains` uses `avatarUrl(member.avatar)` when present (fallback `spriteForUserId`) and `phase` from the journey: studying → running, finished → finished, at-station / answering / on-break / idle → stopped; no journey (older client) → running as today |
| `apps/web/src/routes/session.tsx` | Mounts `useJourneyLink()` |

## Friends' stations (`apps/web/src/features/scene`)

| File | Change |
|---|---|
| `train.tsx` | Registers a companion's `own` motion with `registerMotion(trainId, own.current)` (unregister on unmount). While `own.current.stopTarget !== null` the drift closing is skipped, so a resting friend stays on its platform when the leader also stops |
| `lane.tsx` | Every lane spawns stations from its own train's phase. The motion it reads is the lane motion for the local train and `getMotion(trainId)` for a companion. Placement is unchanged: right here if standing, `STATION_DISTANCE` ahead otherwise, and `stopTarget` is set on that motion so the train brakes to the platform. Running clears it |

Station meshes are positioned by `worldX - laneMotion.scroll` as today; a
companion's `own.scroll` is `lane.scroll + gap`, so its platform lines up with
where it halts.

## Roster indicators (`apps/web/src/features/chat/chat-panel.tsx`)

Below the riders sentence, one row per member: the avatar image
(`avatarUrl(member.avatar)`, or the hashed fallback sprite), the display
name, and a status from `journeyLabel(journey)`: "Station 2 of 6", "On a
break", "Answering at station 2", "Finished", or nothing when idle or absent.
Pure `journeyLabel` lives beside `ridersLabel`.

## Testing

- `packages/shared`: journey and study-session schemas accept and reject.
- `features/conductor`: `phaseForMode`, `journeyForSession`; study-session
  tests (mocked API) assert the spoken line and the efficiency report at each
  transition, and the history calls; history wrapper swallows failures.
- `features/speech`: `sayText`; departure tests deleted with the file.
- `features/chat`: `journey-link` dedupe and resend-on-new-sink; `journeyLabel`.
- `features/session`: `partyTrains` avatar and phase mapping; `useJourneyLink`
  reports on mode change (store-driven, no socket).
- `apps/api`: hub journey event updates the roster; study-session routes with
  `:memory:` SQLite: start, record, end, list with latest-attempt semantics.
- Scene stays manual: dev panel adds a friend, and the friend's lane shows a
  platform when its phase is stopped.

## Out of scope

- A shared route for the room.
- Persisting answers or questions; only verdicts and scores are kept.
- Rich dashboard analytics beyond the session list.

## Deviations (recorded after implementation)

- Friends' stations (Task 7c): a companion train's motion is registered by
  an effect inside `Train`, a child of `Lane`. If a friend's train first
  mounts already `stopped` or `finished` — rather than transitioning into
  that phase after joining — `Lane`'s station effect can run on the same
  commit while `getMotion(trainId)` is still `undefined`, so it returns
  without placing a platform or setting `stopTarget`. The companion then
  cruises through where its platform should be. Because the effect's
  dependency is `[phase, ...]`, this self-heals on that companion's *next*
  phase change, once `getMotion` is populated — so a friend who joins already
  at a station only shows a platform after their journey changes at least
  once more. This was flagged as a known, scoped edge case rather than fixed.
- `features/conductor/history.ts` does not log failures (no `console.error`
  anywhere in the module): `startHistory`, `recordHistory`, and `endHistory`
  fail silently so a missing API never blocks or interrupts a study session.
  Only the read, `fetchHistory`, throws — that is what lets `SessionHistory`
  render "History is unavailable right now." instead of a blank dashboard.
  "Failures logged and swallowed" in the History section above overstates
  this for the three write paths.
