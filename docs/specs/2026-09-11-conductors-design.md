# Conductors

Every train has a conductor: the hand-drawn avatar its owner picked, riding
the locomotive. The conductor is the face of that user's personal agent. When
the agent has something to say, the conductor bobs and a speech bubble appears
above it. Conductors on different trains talk to each other this way.

This spec covers picking an avatar, storing it under a browser-identified
user record, and rendering speech in the scene. It builds on the train world
spec (`2026-09-11-train-world-design.md`), which already renders one
billboarded sprite per train from `TrainState.owner.spriteUrl`.

## Decisions

- No accounts. The browser generates a random user id once, keeps it in
  localStorage, and the server stores the user record under that id. Clearing
  site data makes a new user.
- The avatar is an enum of the drawings in `public/characters/`. The web maps
  an id to its PNG URL; the wire format for trains keeps carrying `spriteUrl`.
- Speech lives on the train in the shared schema, so friends' conductor
  bubbles arrive through the existing snapshot format with no new channel.
- Speech expires by timestamp, not by timer. The store stamps `until`; the
  scene compares against the clock. The scene still never writes the store.
- Bubbles are DOM, rendered in the scene with drei `Html`, so text wraps and
  styles like the rest of the app while following the sprite in 3D.
- The user's own chat with their agent is a separate chatbox, not a bubble.
  Bubbles are only what conductors say out loud in the world.

## State (`packages/shared`)

```ts
AvatarId    = "conductor" | "bonbon" | "poku"
User        = { id, name, avatar: AvatarId, createdAt }
UserProfile = Pick<User, "name" | "avatar">          // PUT body
Speech      = { id, text, until: number }             // until is epoch ms
TrainState  = { ...existing, speech?: Speech }
```

`AvatarId`, `User`, and `UserProfile` live in `schemas/user.ts`; `Speech`
joins `schemas/train.ts`.

`speech.id` is unique per utterance so the bubble can re-animate when the
same text is said twice and so snapshot upserts replace rather than merge.

`until` is compared against the receiving client's clock. Skew between
clients is accepted here and belongs to the multiplayer spec.

## World store (`apps/web/src/features/world`)

New commands:

- `say(id, text)` — sets `speech` on the train to
  `{ id: randomUUID(), text, until: Date.now() + speechDuration(text) }`.
  Unknown train is a no-op. A new `say` replaces any live speech.
- `setOwner(id, owner)` — replaces `owner` so the session can push a changed
  name or avatar onto the local train.

`speechDuration(text)` in `speech.ts` is pure: a base of 1.5 s plus 50 ms per
character, clamped to 2 s .. 8 s.

No timers. Nothing in the store clears speech; it is simply stale once
`Date.now() >= until`, and the next `say` overwrites it.

## Scene (`apps/web/src/features/scene`)

| File | Change |
|---|---|
| `character.tsx` | Takes `trainId` as well as `url`. Subscribes to that train's `speech`. Wraps the billboard in a group whose y offset bobs while speech is live. Renders `SpeechBubble` inside the bobbing group |
| `speech-bubble.tsx` | New. drei `Html` above the sprite showing `speech.text` in a rounded bubble with a tail. Hidden once `until` passes |
| `train.tsx` | Passes `trainId` to `Character` |
| `constants.ts` | `BUBBLE_OFFSET`, `BOB_AMPLITUDE`, `BOB_FREQUENCY` |

Behaviour:

- Bob: in `useFrame`, an amplitude scalar eases toward 1 while
  `Date.now() < speech.until` and toward 0 otherwise. A phase accumulator
  advances only while the amplitude is above zero. `y = amplitude *
  BOB_AMPLITUDE * sin(phase)`. The sprite therefore settles smoothly instead
  of snapping when speech ends. Per-frame state is in refs, never React
  state, matching the wheels and smoke.
- Bubble: `Html` with `center`, a `distanceFactor` so far lanes get slightly
  smaller bubbles, and a low `zIndexRange` so the dev panel stays on top.
  Content is a Tailwind div: `bg-background`, border, rounded, max width, a
  small triangular tail pointing down. It pops in with `tw-animate-css`
  (`animate-in fade-in zoom-in`). A `setTimeout` for `until - now` flips a
  local `visible` flag off; a new `speech.id` resets it. Speaker name is not
  shown; the bubble sits over the speaker.
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
- `routes/session.tsx` calls `useProfile().load()` on mount, creates the local
  train once `status` is `ready` or `error`, with `owner: { name: user.name,
  spriteUrl: avatarUrl(user.avatar) }` or the default profile on error, so
  the API being down never blocks a session. It calls `setOwner` on the local
  train whenever `user` changes afterwards. The world store persists across
  routes, so this is what carries a new avatar from Settings to a train that
  already exists.
- `routes/session-dev-panel.tsx` gains a "chatter" button: every train says
  one line from a small canned list, staggered by 1.5 s per train, so
  cross-train bubbles and bobbing can be checked by hand. Friend trains keep
  using `bonbon.png`. The panel gets `z-20` so it sits above the bubbles'
  `zIndexRange`.

## Assets

`public/characters/` already holds `conductor.png`, `bonbon.png`, and
`poku.png`, 500 x 500 line art on transparency. Adding a drawing means adding
its id to the shared enum, its PNG here, and its display name in
`avatars.ts`.

## Testing

- `packages/shared`: `userProfileSchema` rejects an unknown avatar;
  `trainStateSchema` accepts a train with and without `speech`.
- `features/world`: `say` sets text and an `until` in the future and replaces
  live speech; `say` on an unknown id is a no-op; `speechDuration` clamps at
  both ends; `setOwner` replaces the owner.
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

- Typewriter text reveal and voice.
- Editing the display name. The default is "You".
- The agent transport that will eventually call `say`. Agents reach world
  commands through the API in their own spec.
- The user's chatbox for talking to their own agent.
- Clock skew between clients for `until`. Multiplayer spec.
