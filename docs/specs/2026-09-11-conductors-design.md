# Conductors

Every train has a conductor: the hand-drawn avatar its owner picked, riding
the locomotive. The conductor is the face of that user's personal agent. When
the agent has something to say, the conductor bobs and a speech bubble appears
above it for as long as the voice clip plays. Conductors on different trains
talk to each other this way.

This spec covers picking an avatar, storing it under a browser-identified
user record, playing speech, and rendering it in the scene. It builds on the
train world spec (`2026-09-11-train-world-design.md`), which already renders
one billboarded sprite per train from `TrainState.owner.spriteUrl`.

## Decisions

- No accounts. The browser generates a random user id once, keeps it in
  localStorage, and the server stores the user record under that id. Clearing
  site data makes a new user.
- The avatar is an enum of the drawings in `public/characters/`. The web maps
  an id to its PNG URL; the wire format for trains keeps carrying `spriteUrl`.
- Speech lives on the train in the shared schema, so friends' conductor
  bubbles arrive through the existing snapshot format with no new channel.
- Speech lasts as long as its voice clip. A speech player, a driver like the
  session timer, plays the clip and clears the speech when it ends. Lines
  without a clip fall back to a text-length duration. The store holds no
  timers and the scene never writes it.
- The scene shows a bubble and bobs the conductor exactly while a train has
  `speech`. It knows nothing about audio or durations.
- Bubbles are DOM, rendered in the scene with drei `Html`, so text wraps and
  styles like the rest of the app while following the sprite in 3D.
- The user's own chat with their agent is a separate chatbox, not a bubble.
  Bubbles are only what conductors say out loud in the world.

## State (`packages/shared`)

```ts
AvatarId    = "conductor" | "bonbon" | "poku"
User        = { id, name, avatar: AvatarId, createdAt }
UserProfile = Pick<User, "name" | "avatar">          // PUT body
Speech      = { id, text, audioUrl?: string }
TrainState  = { ...existing, speech?: Speech }
```

`AvatarId`, `User`, and `UserProfile` live in `schemas/user.ts`; `Speech`
joins `schemas/train.ts`.

`speech.id` is unique per utterance so the player plays each line once, the
bubble re-animates when the same text is said twice, and snapshot upserts
replace rather than merge. `audioUrl` is any URL the browser can play; where
clips come from is the agent pipeline's concern.

## World store (`apps/web/src/features/world`)

New commands:

- `say(id, text, audioUrl?)` — sets `speech` on the train to
  `{ id: crypto.randomUUID(), text, audioUrl }`. Unknown train is a no-op. A
  new `say` replaces any live speech.
- `clearSpeech(id, speechId)` — removes `speech` from the train only if its
  current `speech.id` equals `speechId`, so a line that finished late can't
  wipe a newer one.
- `setOwner(id, owner)` — replaces `owner` so the session can push a changed
  name or avatar onto the local train.

The store stays pure data. Nothing in it knows how long speech lasts.

## Speech player (`apps/web/src/features/speech`)

New feature, no rendering. It watches the world for new utterances on any
train, plays them, and clears them when they finish.

| File | Responsibility |
|---|---|
| `player.ts` | `createSpeechPlayer({ createAudio, setTimeout, clearTimeout })` returns `{ start(), stop() }`. `start` subscribes to `useWorld`; for each train whose `speech.id` it has not seen, it plays that speech. Ended, errored, or rejected playback calls `clearSpeech(trainId, speech.id)`. `stop` unsubscribes and stops anything playing |
| `duration.ts` | `speechDuration(text)`: 1.5 s plus 50 ms per character, clamped to 2 s .. 8 s. Used when there is no clip |
| `use-speech-player.ts` | `useSpeechPlayer()` creates one player with the real `Audio` constructor and window timers, starts it on mount, stops on unmount |

Behaviour:

- With `audioUrl`: `createAudio(url)`, `play()`. Clear on `ended`, on
  `error`, and if `play()` rejects. Autoplay policies reject `play()` before
  the user has interacted with the page; in that case the line falls back to
  the text-length timer instead of vanishing.
- Without `audioUrl`: a timer for `speechDuration(text)`, then clear.
- Seen ids are kept in a `Set` so a snapshot that re-delivers a friend's
  speech after the player has already handled it does not replay it. One
  utterance plays at a time per train; a new `say` on a train stops that
  train's current clip and clears its timer.
- Friends' clips play locally too. Conductors are meant to be heard talking
  to each other.

## Scene (`apps/web/src/features/scene`)

| File | Change |
|---|---|
| `character.tsx` | Takes `trainId` as well as `url`. Subscribes to that train's `speech`. Wraps the billboard in a group whose y offset bobs while `speech` is set. Renders `SpeechBubble` inside the bobbing group when `speech` is set |
| `speech-bubble.tsx` | New. drei `Html` above the sprite showing `speech.text` in a rounded bubble with a tail. Keyed by `speech.id` so a repeated line re-animates |
| `train.tsx` | Passes `trainId` to `Character` |
| `constants.ts` | `BUBBLE_OFFSET`, `BOB_AMPLITUDE`, `BOB_FREQUENCY` |

Behaviour:

- Bob: in `useFrame`, an amplitude scalar eases toward 1 while the train has
  `speech` and toward 0 otherwise. A phase accumulator advances only while
  the amplitude is above zero. `y = amplitude * BOB_AMPLITUDE * sin(phase)`.
  The sprite settles smoothly instead of snapping when speech ends. Per-frame
  state is in refs, never React state, matching the wheels and smoke.
- Bubble: `Html` with `center`, a `distanceFactor` so far lanes get slightly
  smaller bubbles, and a low `zIndexRange` so the dev panel stays on top.
  Content is a Tailwind div: `bg-background`, border, rounded, max width, a
  small triangular tail pointing down. It pops in with `tw-animate-css`
  (`animate-in fade-in zoom-in`) and unmounts when `speech` clears. Speaker
  name is not shown; the bubble sits over the speaker.
- Because the bubble is inside the bobbing group, it bobs with the conductor.

## Profile (`apps/web/src/features/profile`)

New feature. Its `index.ts` exports `useProfile`, `AVATARS`, `avatarUrl`,
and `AvatarPicker`.

| File | Responsibility |
|---|---|
| `user-id.ts` | `getUserId()`: reads `grugchug.userId` from localStorage, creating it with `crypto.randomUUID()` on first call |
| `avatars.ts` | `AVATARS: { id: AvatarId; name: string; url: string }[]` built from the shared enum; `avatarUrl(id)` returns `/characters/<id>.png` |
| `api.ts` | `fetchUser(id)` (`GET /api/users/:id`, `null` on 404) and `saveUser(id, profile)` (`PUT`), both parsing responses with `userSchema` |
| `store.ts` | zustand: `{ user: User \| null, status: "idle" \| "loading" \| "ready" \| "error", load(), setAvatar(id) }`. `load` fetches; on `null` it PUTs the default profile `{ name: "You", avatar: "poku" }`; a thrown fetch sets `error`. `setAvatar` PUTs and stores the returned user |
| `avatar-picker.tsx` | Renders one button per `AVATARS` entry showing the drawing and name, highlights the current avatar, calls `setAvatar` on click |

## API (`apps/api`)

| Path | Change |
|---|---|
| `src/routes/users.ts` | `createUserRoutes(repo)` returns `{ GET, PUT }` handlers for `/api/users/:id`. GET returns the user or 404. PUT validates the body with `userProfileSchema` (400 on failure), upserts, returns the user |
| `src/users-repo.ts` | `UserRepo = { get(id), upsert(id, profile) }`. `mongoUserRepo(getDb)` stores documents as `{ _id: id, name, avatar, createdAt }` with `$setOnInsert` for `createdAt`. `memoryUserRepo()` is a Map for tests |
| `src/index.ts` | Adds `"/api/users/:id": { GET, PUT }` |

## Wiring

- `routes/settings.tsx` renders `AvatarPicker` under the heading.
- `routes/session.tsx` calls `useProfile().load()` and `useSpeechPlayer()` on
  mount. It creates the local train once `status` is `ready` or `error`, with
  `owner: { name: user.name, spriteUrl: avatarUrl(user.avatar) }` or the
  default profile on error, so the API being down never blocks a session. It
  calls `setOwner` on the local train whenever `user` changes afterwards. The
  world store persists across routes, so this is what carries a new avatar
  from Settings to a train that already exists.
- `routes/session-dev-panel.tsx` gains a "chatter" button: every train says
  one line from a small canned list with no clip, staggered by 1.5 s per
  train, so cross-train bubbles, bobbing, and the fallback timer can be
  checked by hand. Friend trains keep using `bonbon.png`. The panel gets
  `z-20` so it sits above the bubbles' `zIndexRange`.

## Assets

`public/characters/` already holds `conductor.png`, `bonbon.png`, and
`poku.png`, 500 x 500 line art on transparency. Adding a drawing means adding
its id to the shared enum, its PNG here, and its display name in
`avatars.ts`.

No voice clips ship with this spec. The player takes whatever URL a `say`
carries.

## Testing

- `packages/shared`: `userProfileSchema` rejects an unknown avatar;
  `trainStateSchema` accepts a train with and without `speech`.
- `features/world`: `say` sets text, a fresh id, and the clip URL, and
  replaces live speech; `say` on an unknown id is a no-op; `clearSpeech`
  removes a matching id and leaves a newer one alone; `setOwner` replaces the
  owner.
- `features/speech`: with a fake `createAudio` and fake timers, a `say` with a
  clip plays it and clears on `ended`; a rejected `play()` falls back to the
  timer; a `say` without a clip clears after `speechDuration`; a second `say`
  on the same train stops the first clip; a re-delivered seen id is not
  replayed; `stop` unsubscribes. `speechDuration` clamps at both ends.
- `features/profile`: `getUserId` returns the same id on a second call and
  survives a fresh read of localStorage; `AVATARS` has one entry per enum
  value; `load` with a mocked `fetch` creates the default on 404 and reaches
  `ready`; `AvatarPicker` renders three options and calls `setAvatar` on
  click.
- `apps/api`: with `memoryUserRepo`, GET on a missing id is 404; PUT then GET
  round-trips; PUT with a bad avatar is 400; `createdAt` does not change on a
  second PUT.
- Scene components stay untested; WebGL is unavailable in happy-dom. The dev
  panel's chatter button is the manual check.

## Out of scope

- Generating voice clips. Text to speech, storage, and serving clips belong
  to the agent pipeline. This spec only plays a URL.
- Typewriter text reveal and lip sync.
- Editing the display name. The default is "You".
- The agent transport that will eventually call `say`. Agents reach world
  commands through the API in their own spec.
- The user's chatbox for talking to their own agent.

## Deviations (recorded after implementation)

- A clip that errors or whose `play()` rejects falls back to the text-length
  timer instead of clearing immediately. The player table above said
  "clear"; the behaviour section's fallback rule is what shipped, so a broken
  URL never makes a line vanish before it can be read.
- `stop()` clears the speech it interrupts. Without this, leaving the session
  page mid-line and coming back would replay the stale line with a fresh
  player.
- `AvatarPicker` is presentational (`selected`, `onSelect`, `disabled`); the
  Settings page owns the store. Keeps the picker testable without fetch.
- API handlers take `(id, req)`; `index.ts` unpacks `req.params.id`. Route
  tests then need no `BunRequest`.
- `setAvatar` failure sets `status: "error"` but keeps the last loaded user,
  so the session still rides with the last known avatar.
- The conductor is not the picked avatar. While this spec was being written,
  teammates put a fixed `conductor.png` on every locomotive and moved the
  owner's sprite onto the carriage (commit `8c3a1e6`). The conductor is the
  agent's face and is the sprite that talks and bobs; the picked avatar is
  the passenger. Flipping that is one prop move in `train.tsx`.
- The browser user id lives in `apps/web/src/lib/user-id.ts`, not in
  `features/profile`, because chat needs the same id and features do not
  import each other. Chat sends it as the caller id on a first create or
  join; the server keeps a caller-supplied id.
- Settings labels the picker "Your character", since the pick is the
  passenger, not the conductor.
- Voice lines shipped after all: `features/speech/lines.ts` registers three
  clips, and a departure announcer says the start-of-session line when the
  local train appears running or goes from stopped to running. The local
  train is created running (efficiency drives its speed), so the first
  announcement is the session start itself.
- The local train no longer starts `stopped` with `efficiency: 0.7`; main
  changed it to `running` with the efficiency score before this landed, and
  the session keeps that.
- The dev panel's chatter button has the local conductor say the start-of-session
  voice line with its clip, while friend trains say canned text lines. The
  wiring section above specified a canned line for every train.
