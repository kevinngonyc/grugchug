# Conductors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each train's passenger is the avatar its owner picked, stored under a browser-generated user id on the API, and when a train has speech its conductor bobs and shows a bubble for as long as the voice clip plays.

**Architecture:** `packages/shared` gains an avatar enum on `user`, a `userProfile` PUT body, and an optional `speech` on `trainState`. The world store gets `say`, `clearSpeech`, and `setOwner`. A new `features/speech` driver watches the store, plays each utterance once (clip, or a text-length timer), and clears it when done. `features/scene` renders a bob and a drei `Html` bubble on the conductor sprite while `train.speech` is set and never writes. A new `features/profile` owns the avatar catalog and a store that talks to new `GET`/`PUT /api/users/:id` routes backed by a small repo interface so tests stay offline. The browser user id lives in `src/lib/user-id.ts` so `profile` and the existing `chat` feature share one identity without importing each other.

**Tech Stack:** Bun 1.3, TypeScript 6 (strict, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUncheckedIndexedAccess`), React 19, zustand 5, three 0.183, @react-three/fiber 9, @react-three/drei 10.7, zod 4.6, mongodb 6.21, Tailwind v4 + tw-animate-css, Biome 2, `bun test` + happy-dom 20, @testing-library/react 16.

**Spec:** `docs/specs/2026-09-11-conductors-design.md`

## Global Constraints

- Work in the git worktree at `.claude/worktrees/conductors` on branch `worktree-conductors`, created from `main` at commit `34f2b5a`. `main` is the integration branch; teammates merge to it by pull request. Other sessions share the main working tree; never run `git add -A` or `git add .` anywhere in this repo. Always `git add` explicit paths.
- All commands run from the repo root unless a step says otherwise. `bun run typecheck`, `bun run test`, `bun run lint`, `bun run build` must pass at the end of every task.
- File names are kebab-case. Components are named exports. No default exports.
- `import type` for type-only imports (`verbatimModuleSyntax`). No enums, no parameter properties (`erasableSyntaxOnly`). Record and array index lookups return `T | undefined` (`noUncheckedIndexedAccess`), so guard them with `?.` or `??`.
- Biome formatting: double quotes, semicolons, 2-space indent, 100-column lines. Run `bun run fmt` before each commit.
- Web features live under `apps/web/src/features/<name>/` with an `index.ts` that is the only import surface and a top comment stating the feature's responsibility. Routes and other features import `@/features/<name>`, never a file inside it.
- `features/world` never imports three.js. `features/scene` never writes the store. Per-frame animation state lives in refs, not React state.
- Scene numbers live in `features/scene/constants.ts`.
- Tests run offline: no network, no MongoDB, no WebGL. Web tests get a browser-like global from `apps/web/test/setup.ts` (happy-dom), which provides `localStorage`, `Audio`, `fetch`, and `crypto.randomUUID`.
- `bun test` in `apps/web` resolves the `@/` alias from `tsconfig.json`; tests may use it, but relative imports within a feature are preferred.
- Commit messages: imperative first line, wrapped body, ending with the attribution lines:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N9ri2hm9heyG387RwYuyVU
```

## Facts about the current code (verified)

- `apps/web/src/features/scene/train.tsx` renders two sprites per train after `<Smoke>`, each in its own `<Suspense fallback={null}>`: a fixed conductor, `<Character url={CONDUCTOR_SPRITE_URL} position={CONDUCTOR_OFFSET} />`, on the locomotive, and the owner's avatar, `<Character url={spriteUrl} />`, on the carriage, where `spriteUrl` comes from `useWorld((s) => s.trains[trainId]?.owner.spriteUrl)`. Teammates placed these in commit `8c3a1e6`; this plan keeps that split. The conductor is the agent and is the one that talks; the picked avatar is the passenger.
- `apps/web/src/features/scene/character.tsx` takes `{ url: string; position?: [number, number, number] }` (default `CHARACTER_OFFSET`) and is a `Billboard` holding a `planeGeometry` of `CHARACTER_SIZE = [1.6, 1.6]` with a `useTexture` map.
- `apps/web/src/features/scene/constants.ts` defines `CHARACTER_OFFSET = [-CARRIAGE_GAP, CARRIAGE_HEIGHT + 0.4, 0]`, `CONDUCTOR_OFFSET = [-0.6, LOCOMOTIVE_HEIGHT + 0.4, 0]`, `CONDUCTOR_SPRITE_URL = "/characters/conductor.png"`, `CHARACTER_SIZE = [1.6, 1.6]`, `CAMERA_POSITION = [-1.4, 5, -12]`, `CAMERA_FOV = 35`, `LANE_SPACING = 4`, `LANE_STAGGER = 0`. The camera is about 12 to 13 m from lane 0.
- `apps/web/src/features/scene/train-world.tsx` owns one shared motion for every lane and passes it to `<Lane trainId motion />`.
- `apps/web/src/features/world/store.ts` has a private `patchTrain(s, id, patch)` helper returning `{}` for unknown ids, and `removeTrain` already uses `delete`, so Biome accepts `delete` here.
- `apps/web/src/routes/session.tsx` creates the local train with a hardcoded `owner: { name: "You", spriteUrl: "/characters/poku.png" }` and also renders `<Gaze debug={dev} />` from `@/features/gaze` in a bottom-left box. Keep that.
- `apps/web/src/routes/session-dev-panel.tsx` keeps interval handles in `useRef<ReturnType<typeof setInterval>[]>` and uses `cn` from `@/lib/utils`. Friend trains use `/characters/bonbon.png`.
- `apps/api/src/index.ts` is `Bun.serve({ port, websocket: chatWebSocket, routes: { "/api/health": health, "/api/conductor/...": ..., "/api/chat/...": ... }, fetch() {...} })`. Route values are `{ GET: handler, POST: handler }` objects. Bun types `req` in a `"/api/users/:id"` handler as `BunRequest<"/api/users/:id">` with `req.params.id: string`.
- `apps/api/src/routes/conductor.ts` and `apps/api/src/routes/chat.ts` are the LLM conductor agent and chat backends. They are not touched here. The conductor agent will eventually call `say`; that plumbing is not in this plan.
- The chat feature keeps a browser identity in localStorage under `grugchug.chat.identity` (`{ userId, displayName }`), server-minted on first create or join. The server honours a caller-supplied id: `apps/api/src/routes/chat.ts` does `const userId = callerId(req) ?? newUserId();` where `callerId` reads the `CHAT_USER_HEADER` (`x-grugchug-user`) header, validated by `userIdSchema = z.string().min(1).max(64)`. The three client call sites pass `userId: identity?.userId ?? null`: `apps/web/src/features/chat/chat-rooms-view.tsx` (`onCreate`, `onJoin`) and `apps/web/src/features/chat/join-room-view.tsx` (`submit`).
- `apps/web/test/setup.ts` registers happy-dom and runs Testing Library `cleanup` after each test, so components from one test never leak into the next.
- After merging `origin/main` at `384407d` (commit `6705014` on this branch): `apps/web/src/routes/session.tsx` now creates the local train `running` with `efficiency: efficiencyFraction()`, calls `useEfficiencyDrive()` from `@/features/session`, shows a Focus score box with `<Gaze debug={dev} onFacing={reportAttention} />`, and renders `<ChatOverlay />`. `apps/web/src/routes/session-dev-panel.tsx` replaced the efficiency slider with a manual-override block that reads `useEfficiency`; its `addFriend`, `timers` ref, `friendCounter` ref, cleanup effect, wrapper classes, and "add friend train" button are unchanged. `.llm/AGENTS.md` gained the line "`features/session` is the only writer into `world`", written for the efficiency score; this plan's speech drivers also write to `world` through commands and Task 9 amends that line. `.llm/architecture.md` gained efficiency and chat sections; its `train` and `conductor` schema rows were accidentally left below the Chat section instead of inside the `packages/shared` table.
- Three voice clips are committed at `apps/web/public/audio/start_session1.mp3`, `great_session1.mp3`, `pass_quiz1.mp3` (commit `f2140ff`). The user asked that the start-of-session clip be used for now.
- `apps/api/src/db.ts` exports `getDb(): Promise<Db>`.
- `packages/shared/src/index.ts` does `export * from "./schemas/<file>"` for each schema file (chat, conductor, gaze, session, train, typing, user), so new exports need no index change. `packages/shared/src/schemas/user.ts` is still `{ id, name, createdAt }` with no avatar.
- drei 10.7.8 `Html` props include `center`, `distanceFactor`, `zIndexRange`, `pointerEvents`, and three.js `group` props like `position`.
- zod 4: `z.enum([...]).options` is the readonly array of values; `schema.pick({ a: true })` exists.
- `tw-animate-css` is imported in `apps/web/src/styles/index.css`, so `animate-in fade-in zoom-in-75 duration-200` classes work.

## File structure

```
packages/shared/src/schemas/
  user.ts            + avatarIdSchema, avatar on userSchema, userProfileSchema
  user.test.ts       new
  train.ts           + speechSchema, optional speech on trainStateSchema
  train.test.ts      + speech cases

apps/web/src/features/world/
  store.ts           + say, clearSpeech, setOwner
  store.test.ts      + speech and owner cases
  index.ts           + Speech type export

apps/web/src/features/speech/        new feature: plays speech, clears it when done, announces departures
  index.ts
  duration.ts        speechDuration(text) fallback timing
  duration.test.ts
  player.ts          createSpeechPlayer(deps): watches the world, plays once, clears
  player.test.ts
  use-speech-player.ts   hook wiring the real Audio and window timers
  lines.ts           VOICE_LINES registry: startSession, greatSession, passQuiz (Task 10)
  lines.test.ts
  departure.ts       createDepartureAnnouncer(): says startSession when the local train departs (Task 10)
  departure.test.ts
  use-departure-announcer.ts

apps/web/src/features/scene/
  constants.ts       + BUBBLE_OFFSET, BUBBLE_DISTANCE_FACTOR, BOB_AMPLITUDE, BOB_FREQUENCY, BOB_EASE
  character.tsx      optional trainId; when given, bobbing group + SpeechBubble
  speech-bubble.tsx  new: drei Html bubble
  train.tsx          passes trainId to the conductor Character only

apps/api/src/
  users-repo.ts      UserRepo interface, mongoUserRepo, memoryUserRepo
  routes/users.ts    createUserRoutes(repo) -> { get(id), put(id, req) }
  routes/users.test.ts
  index.ts           + "/api/users/:id" entry in the existing routes table

apps/web/src/lib/
  user-id.ts         getUserId(): the browser's id, minted once into localStorage
  user-id.test.ts

apps/web/src/features/chat/
  chat-rooms-view.tsx    create/join send getUserId() instead of null
  join-room-view.tsx     same

apps/web/src/features/profile/       new feature: who this browser is
  index.ts
  avatars.ts         AVATARS, avatarUrl, DEFAULT_PROFILE, profileOwner
  avatars.test.ts
  api.ts             fetchUser, saveUser
  api.test.ts
  store.ts           createProfileStore(deps), useProfile
  store.test.ts
  avatar-picker.tsx  presentational picker
  avatar-picker.test.tsx

apps/web/src/routes/
  settings.tsx       renders AvatarPicker bound to useProfile
  session.tsx        profile-driven local train, setOwner sync, useSpeechPlayer, useDepartureAnnouncer; keeps efficiency drive, Focus box, Gaze, ChatOverlay
  session-dev-panel.tsx  + chatter button (local conductor says startSession with its clip), z-20

.llm/architecture.md    rows for speech, profile, users route, schema changes
.llm/AGENTS.md          one convention line about speech ownership
docs/specs/2026-09-11-conductors-design.md   Deviations section
```

---

### Task 0: Worktree

**Files:** none in the repo.

- [ ] **Step 1: Create the worktree**

Done with the `superpowers:using-git-worktrees` skill via the native `EnterWorktree` tool: worktree `.claude/worktrees/conductors`, branch `worktree-conductors`, base `main` at `34f2b5a`, `bun install` run. `.claude/worktrees/` is added to `.gitignore` in the first commit so the linked checkout never shows up as untracked in the main tree.

- [ ] **Step 2: Confirm the baseline is green**

Run: `bun run typecheck && bun run test && bun run lint`
Expected: all pass (one api test prints an intentional `MONGODB_URI is not set` stack trace while still passing). If anything fails, stop and report; do not start Task 1 on a red baseline.

---

### Task 1: Shared schemas: avatar, user profile, speech

**Files:**
- Modify: `packages/shared/src/schemas/user.ts`
- Create: `packages/shared/src/schemas/user.test.ts`
- Modify: `packages/shared/src/schemas/train.ts`
- Modify: `packages/shared/src/schemas/train.test.ts`

**Interfaces:**
- Produces: `avatarIdSchema` (zod enum), `AvatarId = "conductor" | "bonbon" | "poku"`, `userSchema` with `avatar: AvatarId`, `userProfileSchema` = `{ name: string; avatar: AvatarId }`, `UserProfile`, `speechSchema`, `Speech = { id: string; text: string; audioUrl?: string }`, `TrainState.speech?: Speech`.

- [ ] **Step 1: Write the failing user tests**

`packages/shared/src/schemas/user.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { avatarIdSchema, userProfileSchema, userSchema } from "./user";

const user = {
  id: "u1",
  name: "You",
  avatar: "poku" as const,
  createdAt: "2026-09-11T00:00:00.000Z",
};

describe("userSchema", () => {
  test("accepts a user with an avatar", () => {
    expect(userSchema.parse(user)).toEqual(user);
  });

  test("rejects a user without an avatar", () => {
    const { avatar: _avatar, ...noAvatar } = user;
    expect(userSchema.safeParse(noAvatar).success).toBe(false);
  });
});

describe("userProfileSchema", () => {
  test("accepts name and avatar", () => {
    const profile = { name: "You", avatar: "conductor" };
    expect(userProfileSchema.parse(profile)).toEqual(profile);
  });

  test("rejects an unknown avatar", () => {
    expect(userProfileSchema.safeParse({ name: "You", avatar: "dragon" }).success).toBe(false);
  });

  test("strips fields the client may not set", () => {
    const parsed = userProfileSchema.parse({ ...user, name: "Ada" });
    expect(parsed).toEqual({ name: "Ada", avatar: "poku" });
  });
});

test("avatarIdSchema lists every drawing in public/characters", () => {
  expect(avatarIdSchema.options).toEqual(["conductor", "bonbon", "poku"]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/shared && bun test src/schemas/user.test.ts`
Expected: FAIL, `avatarIdSchema` and `userProfileSchema` are not exported.

- [ ] **Step 3: Implement user.ts**

Replace `packages/shared/src/schemas/user.ts` with:

```ts
import { z } from "zod";

// The drawings in apps/web/public/characters/. Adding one means adding its id
// here, its PNG there, and its display name in features/profile/avatars.ts.
export const avatarIdSchema = z.enum(["conductor", "bonbon", "poku"]);
export type AvatarId = z.infer<typeof avatarIdSchema>;

// Identified by the browser, not an account: the web mints `id` once and keeps
// it in localStorage. The avatar is the conductor that rides this user's train.
export const userSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  avatar: avatarIdSchema,
  createdAt: z.iso.datetime(),
});
export type User = z.infer<typeof userSchema>;

// What the client may set. Body of PUT /api/users/:id.
export const userProfileSchema = userSchema.pick({ name: true, avatar: true });
export type UserProfile = z.infer<typeof userProfileSchema>;
```

- [ ] **Step 4: Run user tests**

Run: `cd packages/shared && bun test src/schemas/user.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add the failing speech tests**

Append to the `describe("trainStateSchema", ...)` block in `packages/shared/src/schemas/train.test.ts`:

```ts
  test("accepts a train with speech and a clip", () => {
    const speaking = {
      ...train,
      speech: { id: "s1", text: "All aboard!", audioUrl: "/voices/s1.mp3" },
    };
    expect(trainStateSchema.parse(speaking)).toEqual(speaking);
  });

  test("accepts speech without a clip", () => {
    const speaking = { ...train, speech: { id: "s1", text: "All aboard!" } };
    expect(trainStateSchema.parse(speaking)).toEqual(speaking);
  });

  test("rejects empty speech text", () => {
    const result = trainStateSchema.safeParse({ ...train, speech: { id: "s1", text: "" } });
    expect(result.success).toBe(false);
  });
```

- [ ] **Step 6: Run to verify failure**

Run: `cd packages/shared && bun test src/schemas/train.test.ts`
Expected: the two "accepts" tests FAIL because `speech` is stripped by parse (`toEqual` mismatch); "rejects empty" passes vacuously. Both accept tests must fail before continuing.

- [ ] **Step 7: Implement speech in train.ts**

In `packages/shared/src/schemas/train.ts`, add after `TrainOwner`:

```ts
// One thing a conductor is saying. `audioUrl` is the voice clip; without it the
// speech player falls back to a text-length duration. `id` is unique per
// utterance so a repeated line still reads as new.
export const speechSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  audioUrl: z.string().optional(),
});
export type Speech = z.infer<typeof speechSchema>;
```

and add `speech: speechSchema.optional(),` as the last field of `trainStateSchema`, after `lane`.

- [ ] **Step 8: Run shared tests, typecheck, lint**

Run: `cd packages/shared && bun test && cd ../.. && bun run typecheck && bun run lint`
Expected: all pass. `apps/web` still typechecks because `speech` is optional.

- [ ] **Step 9: Commit**

```bash
bun run fmt
git add packages/shared/src/schemas/user.ts packages/shared/src/schemas/user.test.ts \
  packages/shared/src/schemas/train.ts packages/shared/src/schemas/train.test.ts
git commit -m "Add avatar, user profile, and speech schemas to shared

Users carry the avatar that rides their train; trains carry an optional
utterance so conductor speech travels in the snapshot format.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N9ri2hm9heyG387RwYuyVU"
```

---

### Task 2: World store: say, clearSpeech, setOwner

**Files:**
- Modify: `apps/web/src/features/world/store.ts`
- Modify: `apps/web/src/features/world/store.test.ts`
- Modify: `apps/web/src/features/world/index.ts`

**Interfaces:**
- Consumes: `Speech`, `TrainOwner` from `@grugchug/shared` (Task 1).
- Produces: `say(id: string, text: string, audioUrl?: string): void`, `clearSpeech(id: string, speechId: string): void`, `setOwner(id: string, owner: TrainOwner): void` on `WorldState`; `Speech` re-exported from `@/features/world`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/features/world/store.test.ts`, after the existing `describe("useWorld", ...)`:

```ts
describe("speech commands", () => {
  test("say sets speech with a fresh id, the text, and the clip", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.say("local", "All aboard!", "/voices/1.mp3");
    const speech = useWorld.getState().trains.local?.speech;
    expect(speech?.text).toBe("All aboard!");
    expect(speech?.audioUrl).toBe("/voices/1.mp3");
    expect(speech?.id).toBeTruthy();
  });

  test("say without a clip leaves audioUrl undefined", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.say("local", "Hello");
    expect(useWorld.getState().trains.local?.speech?.audioUrl).toBeUndefined();
  });

  test("a new say replaces live speech under a new id", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.say("local", "one");
    const first = useWorld.getState().trains.local?.speech?.id;
    w.say("local", "two");
    const second = useWorld.getState().trains.local?.speech;
    expect(second?.text).toBe("two");
    expect(second?.id).not.toBe(first);
  });

  test("say on an unknown train is a no-op", () => {
    useWorld.getState().say("ghost", "boo");
    expect(useWorld.getState().trains).toEqual({});
  });

  test("clearSpeech removes the matching utterance and nothing else", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.say("local", "one");
    const id = useWorld.getState().trains.local?.speech?.id ?? "";
    w.clearSpeech("local", id);
    expect(useWorld.getState().trains.local).toEqual(local);
  });

  test("clearSpeech leaves a newer utterance alone", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.say("local", "one");
    const stale = useWorld.getState().trains.local?.speech?.id ?? "";
    w.say("local", "two");
    w.clearSpeech("local", stale);
    expect(useWorld.getState().trains.local?.speech?.text).toBe("two");
  });

  test("clearSpeech on an unknown train is a no-op", () => {
    useWorld.getState().clearSpeech("ghost", "x");
    expect(useWorld.getState().trains).toEqual({});
  });
});

describe("setOwner", () => {
  test("replaces the owner", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.setOwner("local", { name: "Ada", spriteUrl: "/characters/conductor.png" });
    expect(useWorld.getState().trains.local?.owner).toEqual({
      name: "Ada",
      spriteUrl: "/characters/conductor.png",
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && bun test src/features/world/store.test.ts`
Expected: FAIL, `w.say is not a function`.

- [ ] **Step 3: Implement the commands**

In `apps/web/src/features/world/store.ts`:

Change the import to:

```ts
import type { Speech, TrainOwner, TrainPhase, TrainState, WorldSnapshot } from "@grugchug/shared";
```

Add to `WorldState` after `setEfficiency`:

```ts
  say: (id: string, text: string, audioUrl?: string) => void;
  clearSpeech: (id: string, speechId: string) => void;
  setOwner: (id: string, owner: TrainOwner) => void;
```

Add to the store body after `setEfficiency`:

```ts
  // One utterance per train. A new line replaces whatever was up.
  say: (id, text, audioUrl) =>
    set((s) => {
      const speech: Speech = { id: crypto.randomUUID(), text, audioUrl };
      return patchTrain(s, id, { speech });
    }),

  // Only the utterance that finished may clear itself; a newer line stays.
  clearSpeech: (id, speechId) =>
    set((s) => {
      const train = s.trains[id];
      if (!train || train.speech?.id !== speechId) return {};
      const cleared: TrainState = { ...train };
      delete cleared.speech;
      return { trains: { ...s.trains, [id]: cleared } };
    }),

  setOwner: (id, owner) => set((s) => patchTrain(s, id, { owner })),
```

- [ ] **Step 4: Export the Speech type**

In `apps/web/src/features/world/index.ts`, change the type export block to:

```ts
export type {
  Speech,
  TrainOwner,
  TrainPhase,
  TrainState,
  WorldSnapshot,
} from "@grugchug/shared";
```

- [ ] **Step 5: Run tests, typecheck, lint**

Run: `cd apps/web && bun test src/features/world && cd ../.. && bun run typecheck && bun run lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
bun run fmt
git add apps/web/src/features/world/store.ts apps/web/src/features/world/store.test.ts \
  apps/web/src/features/world/index.ts
git commit -m "Add say, clearSpeech, and setOwner world commands

The store holds the current utterance per train and nothing about how
long it lasts; the speech player clears it when the clip ends.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N9ri2hm9heyG387RwYuyVU"
```

---

### Task 3: Speech player feature

**Files:**
- Create: `apps/web/src/features/speech/duration.ts`
- Create: `apps/web/src/features/speech/duration.test.ts`
- Create: `apps/web/src/features/speech/player.ts`
- Create: `apps/web/src/features/speech/player.test.ts`
- Create: `apps/web/src/features/speech/use-speech-player.ts`
- Create: `apps/web/src/features/speech/index.ts`

**Interfaces:**
- Consumes: `useWorld` (`say`, `clearSpeech`, `subscribe`, `getState`) from `@/features/world`; `Speech` type.
- Produces: `speechDuration(text: string): number` (ms); `createSpeechPlayer(deps: SpeechPlayerDeps): SpeechPlayer` where `SpeechPlayer = { start(): void; stop(): void }`, `SpeechPlayerDeps = { createAudio(url): AudioLike; setTimeout(fn, ms): unknown; clearTimeout(handle: unknown): void }`, `AudioLike = { play(): Promise<void>; pause(): void; addEventListener(type: "ended" | "error", listener: () => void): void }`; `useSpeechPlayer(): void` hook. `index.ts` exports `useSpeechPlayer` only.

- [ ] **Step 1: Write the failing duration test**

`apps/web/src/features/speech/duration.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { SPEECH_MAX_MS, SPEECH_MIN_MS, speechDuration } from "./duration";

describe("speechDuration", () => {
  test("never drops below the minimum", () => {
    expect(speechDuration("")).toBe(SPEECH_MIN_MS);
    expect(speechDuration("Hi")).toBe(SPEECH_MIN_MS);
  });

  test("grows with text length", () => {
    // 1500 base + 50 * 20 chars
    expect(speechDuration("x".repeat(20))).toBe(2500);
  });

  test("never exceeds the maximum", () => {
    expect(speechDuration("x".repeat(500))).toBe(SPEECH_MAX_MS);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && bun test src/features/speech/duration.test.ts`
Expected: FAIL, cannot find module `./duration`.

- [ ] **Step 3: Implement duration.ts**

```ts
// How long a line stays up when there is no voice clip to time it.
export const SPEECH_BASE_MS = 1500;
export const SPEECH_PER_CHAR_MS = 50;
export const SPEECH_MIN_MS = 2000;
export const SPEECH_MAX_MS = 8000;

export function speechDuration(text: string): number {
  const raw = SPEECH_BASE_MS + SPEECH_PER_CHAR_MS * text.length;
  return Math.min(SPEECH_MAX_MS, Math.max(SPEECH_MIN_MS, raw));
}
```

- [ ] **Step 4: Run the duration test**

Run: `cd apps/web && bun test src/features/speech/duration.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing player tests**

`apps/web/src/features/speech/player.test.ts`:

```ts
import { beforeEach, describe, expect, test } from "bun:test";
import type { TrainState } from "@grugchug/shared";
import { useWorld } from "@/features/world";
import { speechDuration } from "./duration";
import { type AudioLike, createSpeechPlayer } from "./player";

const local: TrainState = {
  id: "local",
  owner: { name: "You", spriteUrl: "/characters/poku.png" },
  phase: "running",
  efficiency: 0.5,
  lane: 0,
};

const friend: TrainState = { ...local, id: "friend", lane: 1 };

class FakeAudio implements AudioLike {
  url: string;
  paused = false;
  playCalls = 0;
  rejectPlay = false;
  private listeners: Record<"ended" | "error", (() => void)[]> = { ended: [], error: [] };

  constructor(url: string) {
    this.url = url;
  }
  play(): Promise<void> {
    this.playCalls++;
    return this.rejectPlay ? Promise.reject(new Error("autoplay blocked")) : Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  addEventListener(type: "ended" | "error", listener: () => void): void {
    this.listeners[type].push(listener);
  }
  fire(type: "ended" | "error"): void {
    for (const l of this.listeners[type]) l();
  }
}

type Scheduled = { id: number; fn: () => void; ms: number };

function fakeTimers() {
  let next = 1;
  const pending: Scheduled[] = [];
  return {
    pending,
    setTimeout: (fn: () => void, ms: number): unknown => {
      const id = next++;
      pending.push({ id, fn, ms });
      return id;
    },
    clearTimeout: (handle: unknown): void => {
      const i = pending.findIndex((p) => p.id === handle);
      if (i >= 0) pending.splice(i, 1);
    },
    runAll(): void {
      for (const p of pending.splice(0)) p.fn();
    },
  };
}

function setup(opts: { rejectPlay?: boolean } = {}) {
  const audios: FakeAudio[] = [];
  const timers = fakeTimers();
  const player = createSpeechPlayer({
    createAudio: (url) => {
      const audio = new FakeAudio(url);
      audio.rejectPlay = opts.rejectPlay ?? false;
      audios.push(audio);
      return audio;
    },
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });
  return { audios, timers, player };
}

// Lets a rejected play() settle its catch handler.
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

const speechOf = (id: string) => useWorld.getState().trains[id]?.speech;

beforeEach(() => {
  useWorld.setState({ trains: {}, localTrainId: null });
  useWorld.getState().addTrain(local);
});

describe("createSpeechPlayer", () => {
  test("plays a clip and clears the speech when it ends", () => {
    const { audios, player } = setup();
    player.start();
    useWorld.getState().say("local", "All aboard!", "/voices/1.mp3");
    expect(audios).toHaveLength(1);
    expect(audios[0]?.url).toBe("/voices/1.mp3");
    expect(audios[0]?.playCalls).toBe(1);
    expect(speechOf("local")?.text).toBe("All aboard!");
    audios[0]?.fire("ended");
    expect(speechOf("local")).toBeUndefined();
  });

  test("a rejected play falls back to the text timer", async () => {
    const { timers, player } = setup({ rejectPlay: true });
    player.start();
    useWorld.getState().say("local", "Hi", "/voices/1.mp3");
    await flush();
    expect(timers.pending).toHaveLength(1);
    expect(timers.pending[0]?.ms).toBe(speechDuration("Hi"));
    expect(speechOf("local")?.text).toBe("Hi");
    timers.runAll();
    expect(speechOf("local")).toBeUndefined();
  });

  test("a clip that errors falls back to the text timer once", async () => {
    const { audios, timers, player } = setup({ rejectPlay: true });
    player.start();
    useWorld.getState().say("local", "Hi", "/voices/broken.mp3");
    audios[0]?.fire("error");
    await flush();
    expect(timers.pending).toHaveLength(1);
  });

  test("a line without a clip clears after speechDuration", () => {
    const { audios, timers, player } = setup();
    player.start();
    useWorld.getState().say("local", "Hi");
    expect(audios).toHaveLength(0);
    expect(timers.pending[0]?.ms).toBe(speechDuration("Hi"));
    timers.runAll();
    expect(speechOf("local")).toBeUndefined();
  });

  test("a second say on the same train stops the first clip", () => {
    const { audios, player } = setup();
    player.start();
    useWorld.getState().say("local", "one", "/voices/1.mp3");
    useWorld.getState().say("local", "two", "/voices/2.mp3");
    expect(audios[0]?.paused).toBe(true);
    audios[0]?.fire("ended");
    expect(speechOf("local")?.text).toBe("two");
    audios[1]?.fire("ended");
    expect(speechOf("local")).toBeUndefined();
  });

  test("does not replay an utterance it has already seen", () => {
    const { audios, player } = setup();
    useWorld.getState().addTrain(friend);
    useWorld.getState().setLocalTrainId("local");
    player.start();
    useWorld.getState().say("friend", "Hello there", "/voices/f.mp3");
    const speech = speechOf("friend");
    audios[0]?.fire("ended");
    expect(speechOf("friend")).toBeUndefined();
    // A snapshot re-delivers the friend's train still carrying the same line.
    useWorld.getState().applySnapshot({ trains: { friend: { ...friend, speech } } });
    expect(speechOf("friend")?.id).toBe(speech?.id);
    expect(audios).toHaveLength(1);
  });

  test("a train removed mid-line stops its clip", () => {
    const { audios, player } = setup();
    player.start();
    useWorld.getState().say("local", "one", "/voices/1.mp3");
    useWorld.getState().removeTrain("local");
    expect(audios[0]?.paused).toBe(true);
  });

  test("stop pauses clips, clears their speech, and stops listening", () => {
    const { audios, player } = setup();
    player.start();
    useWorld.getState().say("local", "one", "/voices/1.mp3");
    player.stop();
    expect(audios[0]?.paused).toBe(true);
    expect(speechOf("local")).toBeUndefined();
    useWorld.getState().say("local", "two", "/voices/2.mp3");
    expect(audios).toHaveLength(1);
  });

  test("start picks up speech that is already in the store", () => {
    const { audios, player } = setup();
    useWorld.getState().say("local", "one", "/voices/1.mp3");
    player.start();
    expect(audios).toHaveLength(1);
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `cd apps/web && bun test src/features/speech/player.test.ts`
Expected: FAIL, cannot find module `./player`.

- [ ] **Step 7: Implement player.ts**

```ts
import type { Speech } from "@grugchug/shared";
import { useWorld } from "@/features/world";
import { speechDuration } from "./duration";

// The slice of HTMLAudioElement the player needs, so tests can fake it.
export type AudioLike = {
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: "ended" | "error", listener: () => void): void;
};

export type SpeechPlayerDeps = {
  createAudio: (url: string) => AudioLike;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export type SpeechPlayer = { start(): void; stop(): void };

type Playing = { speechId: string; audio: AudioLike | null; timer: unknown | null };

// Watches the world for new utterances on every train, plays each once, and
// clears it from the store when it finishes. A driver, like the session
// timer: it reaches the world only through commands.
export function createSpeechPlayer(deps: SpeechPlayerDeps): SpeechPlayer {
  const seen = new Set<string>();
  const playing = new Map<string, Playing>();
  let unsubscribe: (() => void) | null = null;

  const halt = (entry: Playing) => {
    entry.audio?.pause();
    if (entry.timer !== null) deps.clearTimeout(entry.timer);
  };

  const stopTrain = (trainId: string) => {
    const entry = playing.get(trainId);
    if (!entry) return;
    halt(entry);
    playing.delete(trainId);
  };

  // Only the line that is still current may clear itself.
  const finish = (trainId: string, speechId: string) => {
    const entry = playing.get(trainId);
    if (entry?.speechId !== speechId) return;
    playing.delete(trainId);
    useWorld.getState().clearSpeech(trainId, speechId);
  };

  const startTimer = (trainId: string, speech: Speech): unknown =>
    deps.setTimeout(() => finish(trainId, speech.id), speechDuration(speech.text));

  const play = (trainId: string, speech: Speech) => {
    seen.add(speech.id);
    stopTrain(trainId);
    const entry: Playing = { speechId: speech.id, audio: null, timer: null };
    playing.set(trainId, entry);

    if (speech.audioUrl === undefined) {
      entry.timer = startTimer(trainId, speech);
      return;
    }

    const audio = deps.createAudio(speech.audioUrl);
    entry.audio = audio;
    audio.addEventListener("ended", () => finish(trainId, speech.id));

    // A clip that will not play (autoplay blocked, bad URL) should not leave the
    // bubble up forever or drop it instantly: time it like a text-only line.
    const fallBack = () => {
      if (playing.get(trainId) !== entry || entry.timer !== null) return;
      entry.timer = startTimer(trainId, speech);
    };
    audio.addEventListener("error", fallBack);
    audio.play().catch(fallBack);
  };

  const sync = () => {
    const { trains } = useWorld.getState();
    for (const [trainId, train] of Object.entries(trains)) {
      const speech = train.speech;
      if (speech && !seen.has(speech.id)) play(trainId, speech);
    }
    // Trains that vanished take their clips with them.
    for (const trainId of [...playing.keys()]) {
      if (!trains[trainId]) stopTrain(trainId);
    }
  };

  return {
    start() {
      if (unsubscribe) return;
      unsubscribe = useWorld.subscribe(sync);
      sync();
    },
    // Clears what it stops so a remounted player never replays a stale line.
    stop() {
      unsubscribe?.();
      unsubscribe = null;
      for (const [trainId, entry] of [...playing]) {
        halt(entry);
        playing.delete(trainId);
        useWorld.getState().clearSpeech(trainId, entry.speechId);
      }
    },
  };
}
```

- [ ] **Step 8: Run the player tests**

Run: `cd apps/web && bun test src/features/speech`
Expected: PASS, 12 tests (3 duration + 9 player).

- [ ] **Step 9: Write the hook and the index**

`apps/web/src/features/speech/use-speech-player.ts`:

```ts
import { useEffect } from "react";
import { createSpeechPlayer } from "./player";

// Mount once on the page that shows the world. Plays every train's speech,
// friends included, and clears each line when its clip ends.
export function useSpeechPlayer(): void {
  useEffect(() => {
    const player = createSpeechPlayer({
      createAudio: (url) => new Audio(url),
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (handle) => window.clearTimeout(handle as number),
    });
    player.start();
    return () => player.stop();
  }, []);
}
```

`apps/web/src/features/speech/index.ts`:

```ts
// Plays conductor speech. Watches the world for new utterances, plays the
// voice clip (or waits a text-length fallback), and clears the speech when it
// is over. The only thing that ever clears speech; the scene just shows it.
export { useSpeechPlayer } from "./use-speech-player";
```

- [ ] **Step 10: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: pass.

- [ ] **Step 11: Commit**

```bash
bun run fmt
git add apps/web/src/features/speech
git commit -m "Add speech player that plays clips and clears finished lines

A driver that watches the world store: each utterance plays once, a
missing or blocked clip falls back to a text-length timer, and the
speech is cleared when it ends.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N9ri2hm9heyG387RwYuyVU"
```

---

### Task 4: Scene: bob, speech bubble, dev chatter

Runs after Task 10, which provides `VOICE_LINES`.

**Files:**
- Modify: `apps/web/src/features/scene/constants.ts`
- Create: `apps/web/src/features/scene/speech-bubble.tsx`
- Modify: `apps/web/src/features/scene/character.tsx`
- Modify: `apps/web/src/features/scene/train.tsx`
- Modify: `apps/web/src/routes/session-dev-panel.tsx`
- Modify: `apps/web/src/routes/session.tsx`

**Interfaces:**
- Consumes: `useWorld` (`trains[id].speech`, `say`), `useSpeechPlayer` and `VOICE_LINES` from `@/features/speech` (Tasks 3 and 10).
- Produces: `Character({ url, position?, trainId? })` where a `trainId` makes the sprite the speaker for that train (bob + bubble); `SpeechBubble({ text })`; constants `BUBBLE_OFFSET`, `BUBBLE_DISTANCE_FACTOR`, `BOB_AMPLITUDE`, `BOB_FREQUENCY`, `BOB_EASE`.

The conductor sprite on the locomotive is the speaker. The passenger sprite on the carriage stays static. To flip that later (make the picked avatar the talker), move `trainId={trainId}` from the conductor `<Character>` to the passenger one in `train.tsx`; nothing else changes.

No unit tests: WebGL is unavailable in happy-dom. Verification is `bun run typecheck`, `bun run build`, and the manual check in Step 6.

- [ ] **Step 1: Add constants**

Append to `apps/web/src/features/scene/constants.ts` directly after the `CHARACTER_SIZE` line:

```ts
// Speech. The bubble's tail sits this far above the sprite's centre. drei
// scales the bubble by BUBBLE_DISTANCE_FACTOR / (2 * tan(fov/2) * distance);
// with the camera about 12.5 m from lane 0 that is roughly 1x there and a
// little smaller on farther lanes. Tune by eye in the dev panel.
export const BUBBLE_OFFSET: [number, number, number] = [0, CHARACTER_SIZE[1] / 2 + 0.15, 0];
export const BUBBLE_DISTANCE_FACTOR = 8;
// The conductor bobs while its train has speech.
export const BOB_AMPLITUDE = 0.12; // metres
export const BOB_FREQUENCY = 9; // radians per second, about 1.4 bobs a second
export const BOB_EASE = 6; // per second; how quickly the bob fades in and out
```

- [ ] **Step 2: Write speech-bubble.tsx**

```tsx
import { Html } from "@react-three/drei";
import { BUBBLE_DISTANCE_FACTOR, BUBBLE_OFFSET } from "./constants";

type SpeechBubbleProps = { text: string };

// A DOM bubble pinned above the conductor. drei projects it to the screen each
// frame, so it follows the train, the lane depth, and the bob. `center` puts
// the element's centre on the anchor; the translate lifts it so the tail sits
// on the anchor instead.
export function SpeechBubble({ text }: SpeechBubbleProps) {
  return (
    <Html
      position={BUBBLE_OFFSET}
      center
      distanceFactor={BUBBLE_DISTANCE_FACTOR}
      zIndexRange={[10, 0]}
      pointerEvents="none"
    >
      <div className="relative w-max max-w-56 -translate-y-1/2 animate-in rounded-2xl border bg-background px-3 py-2 text-sm text-foreground shadow fade-in zoom-in-75 duration-200">
        {text}
        <span className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 border-r border-b bg-background" />
      </div>
    </Html>
  );
}
```

- [ ] **Step 3: Rewrite character.tsx**

Replace `apps/web/src/features/scene/character.tsx` with:

```tsx
import { Billboard, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { type Group, SRGBColorSpace } from "three";
import { useWorld } from "@/features/world";
import {
  BOB_AMPLITUDE,
  BOB_EASE,
  BOB_FREQUENCY,
  CHARACTER_OFFSET,
  CHARACTER_SIZE,
} from "./constants";
import { SpeechBubble } from "./speech-bubble";

type CharacterProps = {
  url: string;
  position?: [number, number, number];
  // When set, this sprite speaks for that train: it bobs and shows a bubble
  // while the train has speech.
  trainId?: string;
};

// A hand-drawn 2D sprite that always faces the camera. Any PNG or SVG with
// width/height attributes works; swap the URL, not the code.
export function Character({ url, position = CHARACTER_OFFSET, trainId }: CharacterProps) {
  const speech = useWorld((s) => (trainId === undefined ? undefined : s.trains[trainId]?.speech));
  const texture = useTexture(url);
  // useTexture caches one Texture per URL, so this mutates a shared object on
  // every render. Safe only because the value is a constant; keep it that way.
  texture.colorSpace = SRGBColorSpace;

  const bob = useRef<Group>(null);
  // Amplitude eases toward 1 while speaking and back to 0 after; the phase
  // only advances while there is amplitude, so the sprite settles instead of
  // snapping and every line starts from rest.
  const amplitude = useRef(0);
  const phase = useRef(0);

  useFrame((_, dt) => {
    if (trainId === undefined) return;
    const step = Math.min(dt, 0.1);
    const speaking = useWorld.getState().trains[trainId]?.speech !== undefined;
    const target = speaking ? 1 : 0;
    amplitude.current += (target - amplitude.current) * Math.min(1, BOB_EASE * step);
    if (amplitude.current < 0.001) {
      amplitude.current = 0;
      phase.current = 0;
    } else {
      phase.current += BOB_FREQUENCY * step;
    }
    if (bob.current) {
      bob.current.position.y = amplitude.current * BOB_AMPLITUDE * Math.sin(phase.current);
    }
  });

  return (
    <group position={position}>
      <group ref={bob}>
        <Billboard>
          <mesh>
            <planeGeometry args={CHARACTER_SIZE} />
            <meshBasicMaterial map={texture} transparent alphaTest={0.5} />
          </mesh>
        </Billboard>
        {speech ? <SpeechBubble key={speech.id} text={speech.text} /> : null}
      </group>
    </group>
  );
}
```

The `key={speech.id}` remounts the bubble on every new line so the pop-in animation replays even when the text repeats. A sprite without `trainId` never subscribes to speech and its `useFrame` returns immediately, so passengers cost nothing extra.

- [ ] **Step 4: Make the conductor the speaker in train.tsx**

In `apps/web/src/features/scene/train.tsx`, change the conductor line

```tsx
        <Character url={CONDUCTOR_SPRITE_URL} position={CONDUCTOR_OFFSET} />
```

to

```tsx
        <Character url={CONDUCTOR_SPRITE_URL} position={CONDUCTOR_OFFSET} trainId={trainId} />
```

Leave the passenger `<Character url={spriteUrl} />` as it is.

- [ ] **Step 5: Add the chatter button and mount the player**

In `apps/web/src/routes/session-dev-panel.tsx` (this file now also has a manual-override score block from main; leave it alone):

Add the import

```ts
import { VOICE_LINES } from "@/features/speech";
```

Add after `const PHASES...`:

```ts
const CHATTER = [
  "All aboard!",
  "Nice pace back there.",
  "Anyone else hear that whistle?",
  "Next stop: a five minute break.",
  "Eyes on the page, not the scenery.",
];
```

Add after `const friendCounter = useRef<number>(0);`:

```ts
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const chatterCounter = useRef<number>(0);
```

Change the cleanup effect to clear both:

```ts
  useEffect(() => {
    return () => {
      for (const t of timers.current) clearInterval(t);
      for (const t of timeouts.current) clearTimeout(t);
    };
  }, []);
```

Add after the `addFriend` function:

```ts
  // Every train says a line in turn, 1.5 s apart. The local conductor says the
  // start-of-session voice line with its clip (a click is a user gesture, so
  // the browser allows the audio); friends say canned text lines, which
  // exercise the fallback timer.
  const chatter = () => {
    const ids = Object.keys(useWorld.getState().trains);
    const offset = chatterCounter.current++;
    ids.forEach((id, i) => {
      const speak = () => {
        if (id === localTrainId) {
          const line = VOICE_LINES.startSession;
          useWorld.getState().say(id, line.text, line.audioUrl);
          return;
        }
        useWorld.getState().say(id, CHATTER[(i + offset) % CHATTER.length] ?? "All aboard!");
      };
      timeouts.current.push(setTimeout(speak, i * 1500));
    });
  };
```

Change the panel's wrapper classes so it sits above the bubbles:

```tsx
        "absolute top-4 right-4 z-20 flex w-56 flex-col gap-3",
```

Add a button after the "add friend train" button:

```tsx
      <button type="button" onClick={chatter} className="rounded border px-2 py-1">
        chatter
      </button>
```

In `apps/web/src/routes/session.tsx`, add the import

```ts
import { useDepartureAnnouncer, useSpeechPlayer } from "@/features/speech";
```

and add these two calls directly after the existing `useEfficiencyDrive();` call:

```ts
  // Conductors: play each utterance's clip and announce departures.
  useSpeechPlayer();
  useDepartureAnnouncer();
```

Nothing else in session.tsx changes in this task; Task 8 rewrites the file.

- [ ] **Step 6: Typecheck, lint, build, manual check**

Run: `bun run typecheck && bun run lint && bun run build`
Expected: pass.

Manual: `bun run dev`, open `http://localhost:5173/session?dev`. Because the local train is created running, its conductor should announce the start-of-session line as soon as the train appears; if you loaded the page directly the browser may block the clip, in which case the bubble still shows for the fallback duration. Click "add friend train" twice, then "chatter". Expected: the local train's conductor (the boxy one on the locomotive) gets a bubble reading the start-of-session caption, the clip plays, and it bobs for the clip's length while the passenger on the carriage stays still; 1.5 s later the first friend's conductor says a canned line, then the second. Each bubble sits over its conductor with a tail pointing down and bobs with it. Text-only bubbles disappear after roughly 2 to 3 s and the bob eases out. Bubbles on farther lanes are a little smaller. The dev panel stays above any bubble. The bubble is DOM, so the station roof or any other geometry never hides it; check it is legible against the sky from the reversed close camera and does not sit off the top of the viewport when the train is stopped at a platform (press "stopped", wait for the halt, then "chatter"). If bubbles look too large, too small, or too high, adjust `BUBBLE_DISTANCE_FACTOR` or `BUBBLE_OFFSET` and re-check. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
bun run fmt
git add apps/web/src/features/scene/constants.ts apps/web/src/features/scene/speech-bubble.tsx \
  apps/web/src/features/scene/character.tsx apps/web/src/features/scene/train.tsx \
  apps/web/src/routes/session-dev-panel.tsx apps/web/src/routes/session.tsx
git commit -m "Show a speech bubble and bob the conductor while its train has speech

drei Html bubble inside a bobbing group on the conductor sprite, keyed
by utterance so repeated lines re-animate. Dev panel gains a chatter
button that plays the start-of-session clip; the session page mounts
the speech player and the departure announcer.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N9ri2hm9heyG387RwYuyVU"
```

---

### Task 5: API: users repo and routes

**Files:**
- Create: `apps/api/src/users-repo.ts`
- Create: `apps/api/src/routes/users.ts`
- Create: `apps/api/src/routes/users.test.ts`
- Modify: `apps/api/src/index.ts`

**Interfaces:**
- Consumes: `User`, `UserProfile`, `userProfileSchema` from `@grugchug/shared` (Task 1); `getDb` from `./db`.
- Produces: `UserRepo = { get(id: string): Promise<User | null>; upsert(id: string, profile: UserProfile): Promise<User> }`, `mongoUserRepo(getDb: () => Promise<Db>): UserRepo`, `memoryUserRepo(now?: () => string): UserRepo`, `createUserRoutes(repo: UserRepo): { get(id: string): Promise<Response>; put(id: string, req: Request): Promise<Response> }`. HTTP: `GET /api/users/:id` 200 `User` or 404; `PUT /api/users/:id` with `UserProfile` body → 200 `User`, 400 on invalid body.

- [ ] **Step 1: Write the failing route tests**

`apps/api/src/routes/users.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { memoryUserRepo } from "../users-repo";
import { createUserRoutes } from "./users";

const put = (id: string, body: BodyInit) =>
  new Request(`http://test/api/users/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body,
  });

const json = (body: unknown) => JSON.stringify(body);

describe("users routes", () => {
  test("GET on a missing user is 404", async () => {
    const users = createUserRoutes(memoryUserRepo());
    const res = await users.get("u1");
    expect(res.status).toBe(404);
  });

  test("PUT creates the user and GET returns it", async () => {
    const users = createUserRoutes(memoryUserRepo(() => "2026-09-11T00:00:00.000Z"));
    const created = await users.put("u1", put("u1", json({ name: "You", avatar: "conductor" })));
    expect(created.status).toBe(200);
    const expected = {
      id: "u1",
      name: "You",
      avatar: "conductor",
      createdAt: "2026-09-11T00:00:00.000Z",
    };
    expect(await created.json()).toEqual(expected);
    const fetched = await users.get("u1");
    expect(fetched.status).toBe(200);
    expect(await fetched.json()).toEqual(expected);
  });

  test("PUT with an unknown avatar is 400 and stores nothing", async () => {
    const users = createUserRoutes(memoryUserRepo());
    const res = await users.put("u1", put("u1", json({ name: "You", avatar: "dragon" })));
    expect(res.status).toBe(400);
    expect((await users.get("u1")).status).toBe(404);
  });

  test("PUT with a body that is not JSON is 400", async () => {
    const users = createUserRoutes(memoryUserRepo());
    const res = await users.put("u1", put("u1", "not json"));
    expect(res.status).toBe(400);
  });

  test("a second PUT updates the profile but keeps createdAt", async () => {
    let tick = 0;
    const users = createUserRoutes(memoryUserRepo(() => `2026-09-11T00:00:0${tick++}.000Z`));
    await users.put("u1", put("u1", json({ name: "You", avatar: "poku" })));
    const res = await users.put("u1", put("u1", json({ name: "Ada", avatar: "bonbon" })));
    expect(await res.json()).toEqual({
      id: "u1",
      name: "Ada",
      avatar: "bonbon",
      createdAt: "2026-09-11T00:00:00.000Z",
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && bun test src/routes/users.test.ts`
Expected: FAIL, cannot find module `../users-repo`.

- [ ] **Step 3: Write users-repo.ts**

```ts
import type { User, UserProfile } from "@grugchug/shared";
import type { Db } from "mongodb";

// Storage behind the users route. The Mongo version is the real one; the
// memory version keeps route tests offline.
export type UserRepo = {
  get(id: string): Promise<User | null>;
  upsert(id: string, profile: UserProfile): Promise<User>;
};

// Stored with the browser's id as _id. createdAt is set once, on insert.
type UserDoc = { _id: string; name: string; avatar: User["avatar"]; createdAt: string };

function toUser(doc: UserDoc): User {
  return { id: doc._id, name: doc.name, avatar: doc.avatar, createdAt: doc.createdAt };
}

export function mongoUserRepo(getDb: () => Promise<Db>): UserRepo {
  const users = async () => (await getDb()).collection<UserDoc>("users");
  return {
    async get(id) {
      const doc = await (await users()).findOne({ _id: id });
      return doc ? toUser(doc) : null;
    },
    async upsert(id, profile) {
      const doc = await (await users()).findOneAndUpdate(
        { _id: id },
        { $set: profile, $setOnInsert: { createdAt: new Date().toISOString() } },
        { upsert: true, returnDocument: "after" },
      );
      if (!doc) throw new Error(`upsert of user ${id} returned no document`);
      return toUser(doc);
    },
  };
}

export function memoryUserRepo(now: () => string = () => new Date().toISOString()): UserRepo {
  const docs = new Map<string, User>();
  return {
    async get(id) {
      return docs.get(id) ?? null;
    },
    async upsert(id, profile) {
      const createdAt = docs.get(id)?.createdAt ?? now();
      const user: User = { id, name: profile.name, avatar: profile.avatar, createdAt };
      docs.set(id, user);
      return user;
    },
  };
}
```

If `tsc` complains that `$set: profile` does not match `MatchKeysAndValues<UserDoc>`, write `$set: { name: profile.name, avatar: profile.avatar }` instead.

- [ ] **Step 4: Write routes/users.ts**

```ts
import { userProfileSchema } from "@grugchug/shared";
import type { UserRepo } from "../users-repo";

// GET reads a user; PUT upserts name and avatar. Identity is whatever id the
// browser minted for itself: there is no auth yet. Handlers take the id
// directly so tests need no BunRequest; index.ts unpacks req.params.
export function createUserRoutes(repo: UserRepo) {
  return {
    async get(id: string): Promise<Response> {
      const user = await repo.get(id);
      if (!user) return Response.json({ error: "not found" }, { status: 404 });
      return Response.json(user);
    },

    async put(id: string, req: Request): Promise<Response> {
      const body: unknown = await req.json().catch(() => undefined);
      const parsed = userProfileSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: "invalid profile" }, { status: 400 });
      return Response.json(await repo.upsert(id, parsed.data));
    },
  };
}
```

- [ ] **Step 5: Run the route tests**

Run: `cd apps/api && bun test src/routes/users.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Mount the route**

`apps/api/src/index.ts` already has a routes table for health, conductor, and chat. Do not replace the file; add three things.

Imports, keeping the existing ones and Biome's sorted order:

```ts
import { getDb } from "./db";
import { createUserRoutes } from "./routes/users";
import { mongoUserRepo } from "./users-repo";
```

After `const port = ...`:

```ts
const users = createUserRoutes(mongoUserRepo(getDb));
```

Inside `routes: { ... }`, directly after the `"/api/health": health,` line:

```ts
    "/api/users/:id": {
      GET: (req) => users.get(req.params.id),
      PUT: (req) => users.put(req.params.id, req),
    },
```

- [ ] **Step 7: Typecheck, lint, build, smoke**

Run: `bun run typecheck && bun run lint && bun run build`
Expected: pass.

Optional smoke if MongoDB is running (`docker compose up -d` and `apps/api/.env` present): `cd apps/api && bun run dev` in one shell, then

```bash
curl -s -X PUT localhost:3000/api/users/smoke -H 'content-type: application/json' \
  -d '{"name":"You","avatar":"conductor"}'
curl -s localhost:3000/api/users/smoke
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/users/nobody
```

Expected: a user JSON twice with the same `createdAt`, then `404`. Skip without Mongo; the route tests cover the handlers.

- [ ] **Step 8: Commit**

```bash
bun run fmt
git add apps/api/src/users-repo.ts apps/api/src/routes/users.ts apps/api/src/routes/users.test.ts \
  apps/api/src/index.ts
git commit -m "Add GET and PUT /api/users/:id backed by a users collection

Handlers take a repo interface so tests run against an in-memory
version. createdAt is set once on insert.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N9ri2hm9heyG387RwYuyVU"
```

---

### Task 6: Profile feature core

**Files:**
- Create: `apps/web/src/lib/user-id.ts`
- Create: `apps/web/src/lib/user-id.test.ts`
- Modify: `apps/web/src/features/chat/chat-rooms-view.tsx`
- Modify: `apps/web/src/features/chat/join-room-view.tsx`
- Create: `apps/web/src/features/profile/avatars.ts`
- Create: `apps/web/src/features/profile/avatars.test.ts`
- Create: `apps/web/src/features/profile/api.ts`
- Create: `apps/web/src/features/profile/api.test.ts`
- Create: `apps/web/src/features/profile/store.ts`
- Create: `apps/web/src/features/profile/store.test.ts`
- Create: `apps/web/src/features/profile/index.ts`

**Interfaces:**
- Consumes: `AvatarId`, `avatarIdSchema`, `User`, `UserProfile`, `userSchema`, `TrainOwner` from `@grugchug/shared`.
- Produces: in `@/lib/user-id`: `USER_ID_KEY = "grugchug.userId"`, `getUserId(storage?: Storage): string` (a `crypto.randomUUID()`, 36 chars, within chat's `userIdSchema` limit of 64). In `@/features/profile`: `Avatar = { id: AvatarId; name: string; url: string }`, `AVATARS: Avatar[]`, `avatarUrl(id: AvatarId): string`, `DEFAULT_PROFILE: UserProfile = { name: "You", avatar: "poku" }`, `profileOwner(user: User | null): TrainOwner`; `fetchUser(id, fetchFn?): Promise<User | null>`, `saveUser(id, profile, fetchFn?): Promise<User>`; `ProfileStatus = "idle" | "loading" | "ready" | "error"`, `ProfileState = { user: User | null; status: ProfileStatus; load(): Promise<void>; setAvatar(avatar: AvatarId): Promise<void> }`, `ProfileDeps`, `createProfileStore(deps)`, `useProfile` (the app's store). `index.ts` exports `AVATARS`, `avatarUrl`, `profileOwner`, `useProfile`, type `ProfileState`. (`AvatarPicker` is added to the index in Task 7.)

- [ ] **Step 1: Write the failing user-id test**

`apps/web/src/lib/user-id.test.ts`:

```ts
import { beforeEach, describe, expect, test } from "bun:test";
import { USER_ID_KEY, getUserId } from "./user-id";

beforeEach(() => {
  localStorage.clear();
});

describe("getUserId", () => {
  test("mints an id on first use and stores it", () => {
    const id = getUserId();
    expect(id.length).toBeGreaterThan(0);
    expect(localStorage.getItem(USER_ID_KEY)).toBe(id);
  });

  test("returns the same id on later calls", () => {
    expect(getUserId()).toBe(getUserId());
  });

  test("respects an id that is already stored", () => {
    localStorage.setItem(USER_ID_KEY, "existing");
    expect(getUserId()).toBe("existing");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && bun test src/lib/user-id.test.ts`
Expected: FAIL, cannot find module `./user-id`.

- [ ] **Step 3: Write user-id.ts**

`apps/web/src/lib/user-id.ts`:

```ts
export const USER_ID_KEY = "grugchug.userId";

// The browser is the account. One random id per browser profile, minted on
// first use and kept in localStorage. Clearing site data makes a new user.
// Shared by profile (the user record) and chat (sent as the caller id on the
// first create or join, which the server keeps) so one browser is one user.
export function getUserId(storage: Storage = localStorage): string {
  const existing = storage.getItem(USER_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  storage.setItem(USER_ID_KEY, id);
  return id;
}
```

- [ ] **Step 4: Run the user-id test**

Run: `cd apps/web && bun test src/lib/user-id.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 4b: Make chat adopt the browser id**

Chat mints its identity server-side on the first create or join unless the client sends an id. Send ours so both features agree on who this browser is.

In `apps/web/src/features/chat/chat-rooms-view.tsx`, add the import

```ts
import { getUserId } from "@/lib/user-id";
```

and in both `onCreate` and `onJoin` change

```ts
        userId: identity?.userId ?? null,
```

to

```ts
        userId: identity?.userId ?? getUserId(),
```

In `apps/web/src/features/chat/join-room-view.tsx`, add the same import and make the same change inside `submit`.

Browsers that already chatted keep their existing chat identity; only first-time chat users pick up the shared id. Run: `cd apps/web && bun test src/features/chat` and expect the existing chat tests to still pass.

- [ ] **Step 5: Write the failing avatars test**

`apps/web/src/features/profile/avatars.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { avatarIdSchema } from "@grugchug/shared";
import { AVATARS, DEFAULT_PROFILE, avatarUrl, profileOwner } from "./avatars";

describe("avatars", () => {
  test("AVATARS has one entry per avatar id, in enum order", () => {
    expect(AVATARS.map((a) => a.id)).toEqual([...avatarIdSchema.options]);
    for (const a of AVATARS) expect(a.name.length).toBeGreaterThan(0);
  });

  test("avatarUrl points into public/characters", () => {
    expect(avatarUrl("poku")).toBe("/characters/poku.png");
  });

  test("profileOwner falls back to the default profile", () => {
    expect(profileOwner(null)).toEqual({
      name: DEFAULT_PROFILE.name,
      spriteUrl: "/characters/poku.png",
    });
  });

  test("profileOwner uses the user's name and avatar", () => {
    const user = {
      id: "u1",
      name: "Ada",
      avatar: "conductor" as const,
      createdAt: "2026-09-11T00:00:00.000Z",
    };
    expect(profileOwner(user)).toEqual({ name: "Ada", spriteUrl: "/characters/conductor.png" });
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `cd apps/web && bun test src/features/profile/avatars.test.ts`
Expected: FAIL, cannot find module `./avatars`.

- [ ] **Step 7: Write avatars.ts**

```ts
import { type AvatarId, type TrainOwner, type User, type UserProfile, avatarIdSchema } from "@grugchug/shared";

export type Avatar = { id: AvatarId; name: string; url: string };

const NAMES: Record<AvatarId, string> = {
  conductor: "Conductor",
  bonbon: "Bonbon",
  poku: "Poku",
};

export function avatarUrl(id: AvatarId): string {
  return `/characters/${id}.png`;
}

// Every drawing the picker offers, in enum order.
export const AVATARS: Avatar[] = avatarIdSchema.options.map((id) => ({
  id,
  name: NAMES[id],
  url: avatarUrl(id),
}));

// What a fresh browser gets before it picks anything.
export const DEFAULT_PROFILE: UserProfile = { name: "You", avatar: "poku" };

// The train owner a profile turns into. Null (not loaded, or API down) rides
// with the default so a session is never blocked on the network.
export function profileOwner(user: User | null): TrainOwner {
  const profile = user ?? DEFAULT_PROFILE;
  return { name: profile.name, spriteUrl: avatarUrl(profile.avatar) };
}
```

- [ ] **Step 8: Run the avatars test**

Run: `cd apps/web && bun test src/features/profile/avatars.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 9: Write the failing api test**

`apps/web/src/features/profile/api.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { fetchUser, saveUser } from "./api";

const user = {
  id: "u1",
  name: "You",
  avatar: "poku",
  createdAt: "2026-09-11T00:00:00.000Z",
};

type Call = { url: string; init: RequestInit | undefined };

function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), { status });
  };
  return { calls, fetchFn };
}

describe("fetchUser", () => {
  test("returns the parsed user", async () => {
    const { calls, fetchFn } = fakeFetch(200, user);
    expect(await fetchUser("u1", fetchFn)).toEqual(user);
    expect(calls[0]?.url).toBe("/api/users/u1");
  });

  test("returns null on 404", async () => {
    const { fetchFn } = fakeFetch(404, { error: "not found" });
    expect(await fetchUser("u1", fetchFn)).toBeNull();
  });

  test("throws on other failures", async () => {
    const { fetchFn } = fakeFetch(500, {});
    await expect(fetchUser("u1", fetchFn)).rejects.toThrow();
  });
});

describe("saveUser", () => {
  test("PUTs the profile as JSON and returns the parsed user", async () => {
    const { calls, fetchFn } = fakeFetch(200, user);
    const result = await saveUser("u1", { name: "You", avatar: "poku" }, fetchFn);
    expect(result).toEqual(user);
    expect(calls[0]?.url).toBe("/api/users/u1");
    expect(calls[0]?.init?.method).toBe("PUT");
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ name: "You", avatar: "poku" }));
  });
});
```

- [ ] **Step 10: Run to verify failure**

Run: `cd apps/web && bun test src/features/profile/api.test.ts`
Expected: FAIL, cannot find module `./api`.

- [ ] **Step 11: Write api.ts**

```ts
import { type User, type UserProfile, userSchema } from "@grugchug/shared";

// Thin wrappers around /api/users. Vite proxies /api to the Bun server in dev.
// `fetchFn` is injectable so tests never touch the network.

export async function fetchUser(id: string, fetchFn: typeof fetch = fetch): Promise<User | null> {
  const res = await fetchFn(`/api/users/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /api/users/${id} failed with ${res.status}`);
  return userSchema.parse(await res.json());
}

export async function saveUser(
  id: string,
  profile: UserProfile,
  fetchFn: typeof fetch = fetch,
): Promise<User> {
  const res = await fetchFn(`/api/users/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error(`PUT /api/users/${id} failed with ${res.status}`);
  return userSchema.parse(await res.json());
}
```

- [ ] **Step 12: Run the api test**

Run: `cd apps/web && bun test src/features/profile/api.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 13: Write the failing store test**

`apps/web/src/features/profile/store.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { User, UserProfile } from "@grugchug/shared";
import { DEFAULT_PROFILE } from "./avatars";
import { type ProfileDeps, createProfileStore } from "./store";

const existing: User = {
  id: "u1",
  name: "You",
  avatar: "conductor",
  createdAt: "2026-09-11T00:00:00.000Z",
};

function fakeDeps(record: User | null, opts: { fetchFails?: boolean } = {}) {
  const saved: UserProfile[] = [];
  let current = record;
  const deps: ProfileDeps = {
    getUserId: () => "u1",
    fetchUser: async () => {
      if (opts.fetchFails) throw new Error("network down");
      return current;
    },
    saveUser: async (id, profile) => {
      saved.push(profile);
      current = { id, ...profile, createdAt: "2026-09-11T00:00:00.000Z" };
      return current;
    },
  };
  return { deps, saved };
}

describe("profile store", () => {
  test("load creates the default profile on a fresh browser", async () => {
    const { deps, saved } = fakeDeps(null);
    const store = createProfileStore(deps);
    await store.getState().load();
    expect(store.getState().status).toBe("ready");
    expect(store.getState().user?.avatar).toBe("poku");
    expect(saved).toEqual([DEFAULT_PROFILE]);
  });

  test("load uses an existing record without saving", async () => {
    const { deps, saved } = fakeDeps(existing);
    const store = createProfileStore(deps);
    await store.getState().load();
    expect(store.getState().user).toEqual(existing);
    expect(saved).toEqual([]);
  });

  test("load reports error when the API is unreachable", async () => {
    const { deps } = fakeDeps(null, { fetchFails: true });
    const store = createProfileStore(deps);
    await store.getState().load();
    expect(store.getState().status).toBe("error");
    expect(store.getState().user).toBeNull();
  });

  test("load is a no-op once ready", async () => {
    const { deps, saved } = fakeDeps(null);
    const store = createProfileStore(deps);
    await store.getState().load();
    await store.getState().load();
    expect(saved).toHaveLength(1);
  });

  test("setAvatar saves the new avatar with the current name", async () => {
    const { deps, saved } = fakeDeps(existing);
    const store = createProfileStore(deps);
    await store.getState().load();
    await store.getState().setAvatar("bonbon");
    expect(saved).toEqual([{ name: "You", avatar: "bonbon" }]);
    expect(store.getState().user?.avatar).toBe("bonbon");
    expect(store.getState().status).toBe("ready");
  });

  test("setAvatar failure keeps the last user and reports error", async () => {
    const { deps } = fakeDeps(existing);
    deps.saveUser = async () => {
      throw new Error("network down");
    };
    const store = createProfileStore(deps);
    await store.getState().load();
    await store.getState().setAvatar("bonbon");
    expect(store.getState().user).toEqual(existing);
    expect(store.getState().status).toBe("error");
  });
});
```

- [ ] **Step 14: Run to verify failure**

Run: `cd apps/web && bun test src/features/profile/store.test.ts`
Expected: FAIL, cannot find module `./store`.

- [ ] **Step 15: Write store.ts**

```ts
import type { AvatarId, User, UserProfile } from "@grugchug/shared";
import { create } from "zustand";
import { getUserId } from "@/lib/user-id";
import { fetchUser, saveUser } from "./api";
import { DEFAULT_PROFILE } from "./avatars";

export type ProfileStatus = "idle" | "loading" | "ready" | "error";

export type ProfileState = {
  user: User | null;
  status: ProfileStatus;
  load: () => Promise<void>;
  setAvatar: (avatar: AvatarId) => Promise<void>;
};

export type ProfileDeps = {
  getUserId: () => string;
  fetchUser: (id: string) => Promise<User | null>;
  saveUser: (id: string, profile: UserProfile) => Promise<User>;
};

// Built from injectable deps so tests never touch localStorage semantics or
// the network; `useProfile` below is the app's instance.
export function createProfileStore(deps: ProfileDeps) {
  return create<ProfileState>()((set, get) => ({
    user: null,
    status: "idle",

    // GET, and on a fresh browser PUT the default so the record exists. Safe
    // to call from every page that needs the profile; only idle or error
    // states start a load.
    load: async () => {
      const { status } = get();
      if (status === "loading" || status === "ready") return;
      set({ status: "loading" });
      try {
        const id = deps.getUserId();
        const user = (await deps.fetchUser(id)) ?? (await deps.saveUser(id, DEFAULT_PROFILE));
        set({ user, status: "ready" });
      } catch {
        set({ status: "error" });
      }
    },

    // Waits for the server so the store never shows a pick that did not save.
    setAvatar: async (avatar) => {
      const name = get().user?.name ?? DEFAULT_PROFILE.name;
      try {
        const user = await deps.saveUser(deps.getUserId(), { name, avatar });
        set({ user, status: "ready" });
      } catch {
        set({ status: "error" });
      }
    },
  }));
}

export const useProfile = createProfileStore({ getUserId, fetchUser, saveUser });
```

- [ ] **Step 16: Run the store test**

Run: `cd apps/web && bun test src/features/profile/store.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 17: Write index.ts**

```ts
// Who this browser is: the browser id from lib/user-id plus a user record on
// the API holding the display name and the avatar that rides this user's
// train. Owns the avatar catalog and the picker UI.
export { AVATARS, avatarUrl, profileOwner } from "./avatars";
export { type ProfileState, useProfile } from "./store";
```

- [ ] **Step 18: Run all profile and lib tests, typecheck, lint**

Run: `cd apps/web && bun test src/features/profile src/lib src/features/chat && cd ../.. && bun run typecheck && bun run lint`
Expected: pass. New tests: 3 user-id, 4 avatars, 4 api, 6 store.

- [ ] **Step 19: Commit**

```bash
bun run fmt
git add apps/web/src/lib/user-id.ts apps/web/src/lib/user-id.test.ts apps/web/src/features/profile \
  apps/web/src/features/chat/chat-rooms-view.tsx apps/web/src/features/chat/join-room-view.tsx
git commit -m "Add profile feature and a shared browser user id

lib/user-id mints one id per browser into localStorage; chat sends it on
first create or join so both features agree on who this is. The profile
store loads the record from /api/users, creating the default on first
visit, and saves avatar picks.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N9ri2hm9heyG387RwYuyVU"
```

---

### Task 7: Avatar picker and Settings page

**Files:**
- Create: `apps/web/src/features/profile/avatar-picker.tsx`
- Create: `apps/web/src/features/profile/avatar-picker.test.tsx`
- Modify: `apps/web/src/features/profile/index.ts`
- Modify: `apps/web/src/routes/settings.tsx`

**Interfaces:**
- Consumes: `AVATARS`, `useProfile` (Task 6), `cn` from `@/lib/utils`.
- Produces: `AvatarPicker({ selected: AvatarId | undefined; onSelect: (id: AvatarId) => void; disabled?: boolean })`, exported from `@/features/profile`.

- [ ] **Step 1: Write the failing picker test**

`apps/web/src/features/profile/avatar-picker.test.tsx`:

```tsx
import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { AvatarPicker } from "./avatar-picker";

test("renders one button per avatar and marks the selected one", () => {
  render(<AvatarPicker selected="poku" onSelect={() => {}} />);
  const buttons = screen.getAllByRole("button");
  expect(buttons).toHaveLength(3);
  expect(screen.getByRole("button", { name: "Poku" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "Conductor" }).getAttribute("aria-pressed")).toBe(
    "false",
  );
});

test("clicking a drawing reports its id", () => {
  const onSelect = mock((_id: string) => {});
  render(<AvatarPicker selected="poku" onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("button", { name: "Conductor" }));
  expect(onSelect).toHaveBeenCalledWith("conductor");
});

test("disabled blocks clicks", () => {
  const onSelect = mock((_id: string) => {});
  render(<AvatarPicker selected={undefined} onSelect={onSelect} disabled />);
  fireEvent.click(screen.getByRole("button", { name: "Bonbon" }));
  expect(onSelect).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && bun test src/features/profile/avatar-picker.test.tsx`
Expected: FAIL, cannot find module `./avatar-picker`.

- [ ] **Step 3: Write avatar-picker.tsx**

```tsx
import type { AvatarId } from "@grugchug/shared";
import { cn } from "@/lib/utils";
import { AVATARS } from "./avatars";

type AvatarPickerProps = {
  selected: AvatarId | undefined;
  onSelect: (id: AvatarId) => void;
  disabled?: boolean;
};

// One button per drawing. Presentational: the page that renders it owns the
// store, so this stays testable without fetch.
export function AvatarPicker({ selected, onSelect, disabled = false }: AvatarPickerProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {AVATARS.map((avatar) => {
        const pressed = avatar.id === selected;
        return (
          <button
            key={avatar.id}
            type="button"
            aria-pressed={pressed}
            disabled={disabled}
            onClick={() => onSelect(avatar.id)}
            className={cn(
              "flex w-28 flex-col items-center gap-1 rounded-lg border p-2 text-sm",
              pressed ? "border-primary bg-primary/10" : "hover:bg-muted",
              disabled && "opacity-60",
            )}
          >
            <img src={avatar.url} alt="" className="size-20" />
            {avatar.name}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run the picker test**

Run: `cd apps/web && bun test src/features/profile/avatar-picker.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Export it and build the Settings page**

Add to `apps/web/src/features/profile/index.ts`:

```ts
export { AvatarPicker } from "./avatar-picker";
```

Replace `apps/web/src/routes/settings.tsx` with:

```tsx
import { useEffect } from "react";
import { AvatarPicker, useProfile } from "@/features/profile";

export function Settings() {
  const user = useProfile((s) => s.user);
  const status = useProfile((s) => s.status);
  const load = useProfile((s) => s.load);
  const setAvatar = useProfile((s) => s.setAvatar);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Your character</h2>
        <AvatarPicker
          selected={user?.avatar}
          onSelect={(id) => void setAvatar(id)}
          disabled={status === "loading"}
        />
        {status === "error" ? (
          <p className="text-destructive text-sm">
            Couldn't reach the server, so your pick won't be saved.
          </p>
        ) : null}
      </section>
    </div>
  );
}
```

If Biome reports `lint/complexity/noVoid`, replace each `void x()` with a block that ignores the promise: `() => { setAvatar(id); }` and `useEffect(() => { load(); }, [load]);`.

- [ ] **Step 6: Typecheck, lint, test, build, manual check**

Run: `bun run typecheck && bun run lint && bun run test && bun run build`
Expected: pass.

Manual, with MongoDB up (`docker compose up -d`, `apps/api/.env` from `.env.example`): `bun run dev`, open `http://localhost:5173/settings`. Expected: a "Your character" section with three drawings and names; Poku highlighted on first visit. Click Conductor: it becomes highlighted. Reload: Conductor still highlighted. In devtools Application > Local Storage, `grugchug.userId` holds a UUID. Stop the API only and reload: the red "Couldn't reach the server" line appears and the drawings render unhighlighted. Restart the API.

- [ ] **Step 7: Commit**

```bash
bun run fmt
git add apps/web/src/features/profile/avatar-picker.tsx apps/web/src/features/profile/avatar-picker.test.tsx \
  apps/web/src/features/profile/index.ts apps/web/src/routes/settings.tsx
git commit -m "Add avatar picker to the Settings page

Presentational picker bound to the profile store; the pick is saved to
the user record and survives reloads.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N9ri2hm9heyG387RwYuyVU"
```

---

### Task 8: Session rides with the chosen avatar

**Files:**
- Modify: `apps/web/src/routes/session.tsx`

**Interfaces:**
- Consumes: `useProfile`, `profileOwner` from `@/features/profile` (Task 6); `setOwner` on `useWorld` (Task 2); `useSpeechPlayer`, `useDepartureAnnouncer` from `@/features/speech` (mounted in Task 4); `efficiencyFraction`, `reportAttention`, `useEfficiency` from `@/features/efficiency`; `useEfficiencyDrive` from `@/features/session`; `ChatOverlay` from `@/features/chat`; `Gaze` from `@/features/gaze` (all already used by the file).

No unit test: the route renders the WebGL canvas. `profileOwner` and the store are covered in Task 6; this task is wiring plus a manual check.

- [ ] **Step 1: Rewrite session.tsx**

The file after Task 4 already mounts the speech hooks. Replace the whole file with the version below. Everything from main (efficiency drive, `running` phase with `efficiencyFraction()`, Focus box, Gaze, ChatOverlay) stays exactly as it is; only the profile gating, `owner`, and the `setOwner` sync are new.

```tsx
import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { ChatOverlay } from "@/features/chat";
import { efficiencyFraction, reportAttention, useEfficiency } from "@/features/efficiency";
import { Gaze } from "@/features/gaze";
import { profileOwner, useProfile } from "@/features/profile";
import { TrainWorld } from "@/features/scene";
import { useEfficiencyDrive } from "@/features/session";
import { useDepartureAnnouncer, useSpeechPlayer } from "@/features/speech";
import { useWorld } from "@/features/world";
import { SessionDevPanel } from "./session-dev-panel";

const LOCAL_TRAIN_ID = "local";

export function Session() {
  const localTrainId = useWorld((s) => s.localTrainId);
  const score = useEfficiency((s) => s.score);
  const user = useProfile((s) => s.user);
  const status = useProfile((s) => s.status);
  const load = useProfile((s) => s.load);

  // Gaze reports attention, the quiz will report its own signal, and this
  // hands whatever they add up to on to the train.
  useEfficiencyDrive();
  // Conductors: play each utterance's clip and announce departures.
  useSpeechPlayer();
  useDepartureAnnouncer();

  useEffect(() => {
    void load();
  }, [load]);

  // The local train waits for the profile so it boards with the right
  // passenger. An unreachable API rides with the default rather than blocking.
  useEffect(() => {
    if (localTrainId !== null) return;
    if (status !== "ready" && status !== "error") return;
    const w = useWorld.getState();
    w.addTrain({
      id: LOCAL_TRAIN_ID,
      owner: profileOwner(user),
      // Running from the moment you open a session: the score is what sets the
      // speed from here, and it starts wherever the score starts.
      phase: "running",
      efficiency: efficiencyFraction(),
      lane: 0,
    });
    w.setLocalTrainId(LOCAL_TRAIN_ID);
  }, [localTrainId, status, user]);

  // The world store outlives route changes, so an avatar picked in Settings
  // has to be pushed onto a train that already exists.
  useEffect(() => {
    if (localTrainId === null || !user) return;
    useWorld.getState().setOwner(localTrainId, profileOwner(user));
  }, [localTrainId, user]);

  const [params] = useSearchParams();
  const dev = params.has("dev");

  return (
    <div className="absolute inset-0">
      <TrainWorld />
      {dev ? <SessionDevPanel /> : null}
      <div className="absolute bottom-4 left-4 rounded-lg bg-white/90 font-mono">
        <div className="px-4 pt-3 text-sm font-semibold">Focus {Math.round(score)}/100</div>
        <Gaze debug={dev} onFacing={reportAttention} />
      </div>
      <ChatOverlay />
    </div>
  );
}
```

If Biome reports `lint/complexity/noVoid`, replace `void load();` with a block body `{ load(); }`.

- [ ] **Step 2: Typecheck, lint, test, build, manual check**

Run: `bun run typecheck && bun run lint && bun run test && bun run build`
Expected: pass.

Manual, with MongoDB and both servers up: pick Bonbon in `/settings`, open `/session`. Expected: the tall blob rides the carriage; the boxy conductor is still on the locomotive and announces the start-of-session line as the train appears. Go back to `/settings`, pick Conductor, return to `/session`: the carriage now carries a second boxy figure, no reload needed, and no second announcement (the train already existed). Stop the API, hard-reload `/session`: a train still appears, carrying Poku. Restart the API.

- [ ] **Step 3: Commit**

```bash
bun run fmt
git add apps/web/src/routes/session.tsx
git commit -m "Board the local train with the profile's avatar

The session waits for the profile (or its failure), then creates the
local train from it and keeps the owner in sync with later picks.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N9ri2hm9heyG387RwYuyVU"
```

---

### Task 9: Docs and final verification

**Files:**
- Modify: `.llm/architecture.md`
- Modify: `.llm/AGENTS.md`
- Modify: `docs/specs/2026-09-11-conductors-design.md`

Both `.llm` files were reshaped by the efficiency and chat merges. Edit by finding the quoted anchors; do not rewrite sections you are not asked to touch.

- [ ] **Step 1: Update architecture.md**

In the `## apps/web` table, add these rows directly after the `src/features/world/` row:

```markdown
| `src/features/speech/` | Conductor speech drivers: the player watches `world` for new utterances, plays the clip or a text-length fallback, then `clearSpeech`; the departure announcer says the start-of-session line when the local train departs. `lines.ts` is the voice-line registry |
| `src/features/profile/` | Who this browser is: the user record from `/api/users` (name, avatar), the avatar catalog, and the picker |
```

Change the `src/features/scene/` row to:

```markdown
| `src/features/scene/` | react-three-fiber rendering of the world store: one lane per train, all scrolling with the local train's motion; stations on the local lane, scenery, a conductor and a passenger sprite per train, and a speech bubble plus bob on the conductor while its train has `speech`. Never writes the store |
```

Add after the `src/lib/` row:

```markdown
| `src/lib/user-id.ts` | The browser's user id, minted once into localStorage. Shared by `profile` and `chat` |
```

Add after `public/models/` row:

```markdown
| `public/characters/`, `public/audio/` | Character PNGs and conductor voice clips |
```

Change the data-flow paragraph's final sentence, which currently ends "or a multiplayer sync calling `applySnapshot`.", so the paragraph reads:

```markdown
Data flows one way: `gaze` and `typing` produce samples, those samples become
signals in `efficiency`, `session` collects and persists them and drives
`world` commands from the score, `scene` renders `world`.
`world` is pure TypeScript, so anything can drive it without WebGL: the
session timer, a tracking score, an agent tool call routed through the API,
a multiplayer sync calling `applySnapshot`, or `speech` saying a line and
clearing it when the clip ends. `profile` feeds the local train's owner into
`world`.
```

In the `## apps/api` table, add after the `src/db.ts` row:

```markdown
| `src/routes/users.ts` | `GET`/`PUT /api/users/:id`: read and upsert a browser-identified user's name and avatar |
| `src/users-repo.ts` | `UserRepo` interface; Mongo implementation over the `users` collection and an in-memory one for tests |
```

In the `## packages/shared` table, change the `user` row to:

```markdown
| `user` | Browser-identified user: `id`, `name`, `avatar` (`AvatarId`), `createdAt`; `userProfile` is the PUT body |
```

The `train` and `conductor` rows were left stranded below the `## Chat` section by an earlier merge. Delete those two lines from there and add them to the `## packages/shared` table after the `clientChatEvent` row, with `train` updated:

```markdown
| `train` | `TrainPhase`, `TrainState` (id, owner, phase, efficiency, lane, optional `speech`), `Speech`, `WorldSnapshot` |
| `conductor` | `RoutePlan` of `Station`s with `Question`s, answer and ask bodies. `public*` variants strip answer keys for the browser |
```

In `## Deferred`, replace the "Conductor sprite: ... is committed but unplaced ..." bullet with:

```markdown
- Voice clips: `say(trainId, text, audioUrl)` plays whatever URL it is given. Three clips ship in `public/audio/`; only the start-of-session line is wired up, and its caption in `features/speech/lines.ts` is a placeholder until the transcript is pasted in. Generating clips belongs to the conductor agent pipeline, which does not yet call `say`.
- Speech across clients: each client's speech player clears lines locally. A snapshot that re-delivers a friend's finished line puts its bubble back until the friend's clear propagates. Multiplayer spec.
- One identity: `lib/user-id` is used by profile always and by chat only on a first create or join. A browser that chatted before this landed keeps its older chat id alongside the new profile id until real auth replaces both.
```

- [ ] **Step 2: Update AGENTS.md**

Find the convention bullet that ends with "`features/session` is the only writer into `world`." and change that sentence to:

```markdown
  `features/session` (the score) and `features/speech` (utterances) are the
  only writers into `world`.
```

Append to the `## Conventions` list:

```markdown
- `train.speech` is set by `say` and cleared only by `features/speech`. The
  scene shows a bubble and bobs the conductor sprite while it is set and knows
  nothing about clips or timing.
- Adding a character drawing: add its id to `avatarIdSchema` in shared, the
  PNG to `apps/web/public/characters/`, and its display name in
  `features/profile/avatars.ts`. Adding a voice line: drop the clip in
  `apps/web/public/audio/` and register it in `features/speech/lines.ts`.
```

- [ ] **Step 3: Record deviations in the spec**

Append to `docs/specs/2026-09-11-conductors-design.md`:

```markdown
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
```

- [ ] **Step 4: Final verification**

Run from the repo root:

```bash
bun run typecheck && bun run test && bun run lint && bun run build
```

Expected: all four pass. Then `git status --short` shows only the three doc files modified.

- [ ] **Step 5: Commit**

```bash
bun run fmt
git add .llm/architecture.md .llm/AGENTS.md docs/specs/2026-09-11-conductors-design.md
git commit -m "Document speech and profile features and record spec deviations

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N9ri2hm9heyG387RwYuyVU"
```

- [ ] **Step 6: Hand back**

Use `superpowers:finishing-a-development-branch`. The target is `main`, which teammates integrate into by pull request. Push `worktree-conductors` and open a PR against `main`, or merge locally from the main working tree with explicit paths only; never `git add -A` there.

---

### Task 10: Voice lines and the departure announcer

Runs after Task 3 (it adds files to `features/speech` and extends its `index.ts`) and before Task 4.

**Files:**
- Create: `apps/web/src/features/speech/lines.ts`
- Create: `apps/web/src/features/speech/lines.test.ts`
- Create: `apps/web/src/features/speech/departure.ts`
- Create: `apps/web/src/features/speech/departure.test.ts`
- Create: `apps/web/src/features/speech/use-departure-announcer.ts`
- Modify: `apps/web/src/features/speech/index.ts`

**Interfaces:**
- Consumes: `useWorld` (`say`, `subscribe`, `getState`, `localTrainId`, `trains[id].phase`) from `@/features/world`; `TrainPhase` from `@grugchug/shared`. The clips at `/audio/start_session1.mp3`, `/audio/great_session1.mp3`, `/audio/pass_quiz1.mp3` exist in `apps/web/public/audio/`.
- Produces: `VoiceLine = { text: string; audioUrl: string }`, `VOICE_LINES` with keys `startSession`, `greatSession`, `passQuiz`, `VoiceLineId`; `createDepartureAnnouncer(): { start(): void; stop(): void }`; `useDepartureAnnouncer(): void`. `index.ts` additionally exports `VOICE_LINES`, `type VoiceLineId`, `useDepartureAnnouncer`.

- [ ] **Step 1: Write the failing lines test**

`apps/web/src/features/speech/lines.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { VOICE_LINES } from "./lines";

describe("VOICE_LINES", () => {
  test("start of session plays the start_session clip", () => {
    expect(VOICE_LINES.startSession.audioUrl).toBe("/audio/start_session1.mp3");
    expect(VOICE_LINES.startSession.text.length).toBeGreaterThan(0);
  });

  test("every line has a caption and a clip under /audio/", () => {
    for (const line of Object.values(VOICE_LINES)) {
      expect(line.text.length).toBeGreaterThan(0);
      expect(line.audioUrl.startsWith("/audio/")).toBe(true);
      expect(line.audioUrl.endsWith(".mp3")).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && bun test src/features/speech/lines.test.ts`
Expected: FAIL, cannot find module `./lines`.

- [ ] **Step 3: Write lines.ts**

```ts
// Voice lines the conductor can say. The clips in public/audio are the source
// of truth; the captions are PLACEHOLDERS until the real transcripts are
// pasted in. Adding a line: drop the clip in public/audio and register it here.
export type VoiceLine = { text: string; audioUrl: string };

export const VOICE_LINES = {
  startSession: {
    text: "All aboard! Let's get this study session rolling.", // PLACEHOLDER caption
    audioUrl: "/audio/start_session1.mp3",
  },
  greatSession: {
    text: "Great session! You kept this train right on time.", // PLACEHOLDER caption
    audioUrl: "/audio/great_session1.mp3",
  },
  passQuiz: {
    text: "Quiz passed. Full steam ahead!", // PLACEHOLDER caption
    audioUrl: "/audio/pass_quiz1.mp3",
  },
} as const satisfies Record<string, VoiceLine>;

export type VoiceLineId = keyof typeof VOICE_LINES;
```

- [ ] **Step 4: Run the lines test**

Run: `cd apps/web && bun test src/features/speech/lines.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write the failing departure tests**

`apps/web/src/features/speech/departure.test.ts`:

```ts
import { beforeEach, describe, expect, test } from "bun:test";
import type { TrainState } from "@grugchug/shared";
import { useWorld } from "@/features/world";
import { createDepartureAnnouncer } from "./departure";
import { VOICE_LINES } from "./lines";

const local: TrainState = {
  id: "local",
  owner: { name: "You", spriteUrl: "/characters/poku.png" },
  phase: "stopped",
  efficiency: 0.5,
  lane: 0,
};

const friend: TrainState = { ...local, id: "friend", lane: 1 };

const speechOf = (id: string) => useWorld.getState().trains[id]?.speech;

beforeEach(() => {
  useWorld.setState({ trains: {}, localTrainId: null });
});

describe("createDepartureAnnouncer", () => {
  test("announces when the local train appears running", () => {
    const announcer = createDepartureAnnouncer();
    announcer.start();
    const w = useWorld.getState();
    w.addTrain({ ...local, phase: "running" });
    w.setLocalTrainId("local");
    expect(speechOf("local")?.text).toBe(VOICE_LINES.startSession.text);
    expect(speechOf("local")?.audioUrl).toBe("/audio/start_session1.mp3");
  });

  test("announces a departure from stopped to running", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.setLocalTrainId("local");
    const announcer = createDepartureAnnouncer();
    announcer.start();
    expect(speechOf("local")).toBeUndefined();
    w.setPhase("local", "running");
    expect(speechOf("local")?.text).toBe(VOICE_LINES.startSession.text);
  });

  test("does not announce a train that is already running when it starts", () => {
    const w = useWorld.getState();
    w.addTrain({ ...local, phase: "running" });
    w.setLocalTrainId("local");
    createDepartureAnnouncer().start();
    w.setEfficiency("local", 0.9);
    expect(speechOf("local")).toBeUndefined();
  });

  test("does not announce stopping", () => {
    const w = useWorld.getState();
    w.addTrain({ ...local, phase: "running" });
    w.setLocalTrainId("local");
    createDepartureAnnouncer().start();
    w.setPhase("local", "stopped");
    expect(speechOf("local")).toBeUndefined();
  });

  test("ignores friend trains", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.setLocalTrainId("local");
    w.addTrain(friend);
    createDepartureAnnouncer().start();
    w.setPhase("friend", "running");
    expect(speechOf("friend")).toBeUndefined();
    expect(speechOf("local")).toBeUndefined();
  });

  test("announces every departure with a fresh utterance", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.setLocalTrainId("local");
    createDepartureAnnouncer().start();
    w.setPhase("local", "running");
    const first = speechOf("local")?.id;
    w.setPhase("local", "stopped");
    w.setPhase("local", "running");
    expect(speechOf("local")?.id).toBeTruthy();
    expect(speechOf("local")?.id).not.toBe(first);
  });

  test("stop unsubscribes", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.setLocalTrainId("local");
    const announcer = createDepartureAnnouncer();
    announcer.start();
    announcer.stop();
    w.setPhase("local", "running");
    expect(speechOf("local")).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `cd apps/web && bun test src/features/speech/departure.test.ts`
Expected: FAIL, cannot find module `./departure`.

- [ ] **Step 7: Write departure.ts**

```ts
import type { TrainPhase } from "@grugchug/shared";
import { useWorld } from "@/features/world";
import { VOICE_LINES } from "./lines";

export type DepartureAnnouncer = { start(): void; stop(): void };

// Says the start-of-session line whenever the local train departs: when it
// first appears running (a session starting) or goes from stopped to running.
// Whatever is already running when the announcer starts is not a departure,
// so coming back to the session page does not replay the line. A driver like
// the player: it reaches the world only through `say`.
export function createDepartureAnnouncer(): DepartureAnnouncer {
  let unsubscribe: (() => void) | null = null;
  let lastPhase: TrainPhase | undefined;

  const localTrain = () => {
    const { localTrainId, trains } = useWorld.getState();
    return {
      id: localTrainId,
      phase: localTrainId === null ? undefined : trains[localTrainId]?.phase,
    };
  };

  const sync = () => {
    const { id, phase } = localTrain();
    const departed = id !== null && phase === "running" && lastPhase !== "running";
    // Record before saying: `say` writes the store, which re-enters this
    // listener synchronously, and it must see the phase as already handled.
    lastPhase = phase;
    if (!departed) return;
    const line = VOICE_LINES.startSession;
    useWorld.getState().say(id, line.text, line.audioUrl);
  };

  return {
    start() {
      if (unsubscribe) return;
      lastPhase = localTrain().phase;
      unsubscribe = useWorld.subscribe(sync);
    },
    stop() {
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}
```

- [ ] **Step 8: Run the departure tests**

Run: `cd apps/web && bun test src/features/speech/departure.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 9: Write the hook and extend the index**

`apps/web/src/features/speech/use-departure-announcer.ts`:

```ts
import { useEffect } from "react";
import { createDepartureAnnouncer } from "./departure";

// Mount once on the page that shows the world, alongside useSpeechPlayer.
export function useDepartureAnnouncer(): void {
  useEffect(() => {
    const announcer = createDepartureAnnouncer();
    announcer.start();
    return () => announcer.stop();
  }, []);
}
```

Replace `apps/web/src/features/speech/index.ts` with:

```ts
// Conductor speech. The player watches the world for new utterances, plays the
// voice clip (or waits a text-length fallback), and clears the speech when it
// is over; it is the only thing that ever clears speech. The departure
// announcer says the start-of-session line when the local train departs, and
// lines.ts is the registry of clips a conductor can say. The scene just shows
// whatever speech a train has.
export { useDepartureAnnouncer } from "./use-departure-announcer";
export { type VoiceLine, type VoiceLineId, VOICE_LINES } from "./lines";
export { useSpeechPlayer } from "./use-speech-player";
```

- [ ] **Step 10: Typecheck, lint, tests**

Run: `cd apps/web && bun test src/features/speech && cd ../.. && bun run typecheck && bun run lint`
Expected: pass; speech tests now 21 (3 duration + 9 player + 2 lines + 7 departure).

- [ ] **Step 11: Commit**

```bash
bun run fmt
git add apps/web/src/features/speech/lines.ts apps/web/src/features/speech/lines.test.ts \
  apps/web/src/features/speech/departure.ts apps/web/src/features/speech/departure.test.ts \
  apps/web/src/features/speech/use-departure-announcer.ts apps/web/src/features/speech/index.ts
git commit -m "Add voice-line registry and announce departures

Three clips registered with placeholder captions; the local conductor
says the start-of-session line when its train appears running or pulls
out of a station.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N9ri2hm9heyG387RwYuyVU"
```

---

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
```

- [ ] **Step 4: Final verification**

Run from the repo root:

```bash
bun run typecheck && bun run test && bun run lint && bun run build
```

Expected: all four pass. Then `git status --short` shows only the three doc files modified.

- [ ] **Step 5: Commit**

```bash
bun run fmt
git add .llm/architecture.md .llm/AGENTS.md docs/specs/2026-09-11-conductors-design.md
git commit -m "Document speech and profile features and record spec deviations

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N9ri2hm9heyG387RwYuyVU"
```

- [ ] **Step 6: Hand back**

Use `superpowers:finishing-a-development-branch`. The target is `main`, which teammates integrate into by pull request. Push `conductors` and open a PR against `main`, or merge locally from the main working tree with explicit paths only; never `git add -A` there.
