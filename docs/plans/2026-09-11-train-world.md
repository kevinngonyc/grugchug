# Train World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A side-view 3D world where each study-session train runs while its owner studies, stops at a station on breaks, and can be driven by anything through a small command API.

**Architecture:** `packages/shared` defines the train schemas. `apps/web/src/features/world` is a pure zustand store exposing commands (add/remove train, set phase, set efficiency, apply snapshot) and a speed mapping. `apps/web/src/features/scene` renders the store with react-three-fiber: one scrolling lane per train, each lane owning its own eased speed, track, scenery, and station. Per-frame motion lives in refs, never React state. A dev panel on the session page drives the world by hand.

**Tech Stack:** Bun 1.3, TypeScript 6 (strict, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUncheckedIndexedAccess`), React 19, Vite 8, zustand 5, three 0.183, @react-three/fiber 9, @react-three/drei 10, zod 4, Tailwind v4, Biome, `bun test` + happy-dom.

**Spec:** `docs/specs/2026-09-11-train-world-design.md`

## Global Constraints

- All commands run from the repo root unless a step says otherwise. `bun run typecheck`, `bun run test`, `bun run lint`, `bun run build` must pass at the end of every task.
- File names are kebab-case. Components are named exports. No default exports.
- `import type` for type-only imports (`verbatimModuleSyntax`). No enums, no parameter properties (`erasableSyntaxOnly`). Record lookups return `T | undefined` (`noUncheckedIndexedAccess`), so guard them.
- Biome formatting: double quotes, semicolons, 2-space indent, 100-column lines. Run `bun run fmt` before each commit.
- Path alias `@/` maps to `apps/web/src/`.
- Tests are colocated as `*.test.ts(x)`. `apps/web` tests run with a happy-dom preload from `apps/web/bunfig.toml`.
- `features/world` must never import three.js or `@react-three/*`. `features/scene` must never write to the store.
- One scene unit is one metre. Kit models move along their local +z; the world scrolls along screen +x, so every kit model is wrapped in a group rotated `KIT_ROTATION_Y` about Y.
- Commit after every task with the attribution trailer:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_018gCEPnAopPo7CxJ5jc7RPV
  ```

## Measured model facts (used by the constants below)

World-space bounds of the Kenney glb files, in metres (x, y, z):

| Model | min | max | Note |
|---|---|---|---|
| `train-locomotive-a.glb` | -0.71, 0.00, -1.30 | 0.71, 1.66, 1.30 | centred on z; wheel nodes named `wheels-front` and `wheel` |
| `train-carriage-box.glb` | -0.60, 0.00, -1.35 | 0.60, 1.30, 1.35 | centred on z |
| `railroad-straight.glb` | -0.50, -1.00, 0.00 | 0.50, -0.90, 4.00 | 4 m long, origin at one end, sits 1 m below the origin |
| `tree_default.glb` | -0.38, -0.05, -0.33 | 0.38, 1.66, 0.33 | Nature Kit is toy-scale; scaled 1.5x |
| `rock_smallA.glb` | -0.18, -0.05, -0.18 | 0.18, 0.14, 0.18 | |

## File structure

```
packages/shared/src/schemas/train.ts          TrainPhase, TrainOwner, TrainState, WorldSnapshot (+ test)
packages/shared/src/index.ts                  add export

apps/web/src/features/world/
  index.ts        public surface
  store.ts        zustand store + commands (+ test)
  speed.ts        efficiency -> target speed (+ test)

apps/web/src/features/scene/
  index.ts        exports TrainWorld
  constants.ts    every tunable number
  models.ts       model URLs (+ test that files exist)
  motion.ts       LaneMotion type + per-train registry
  train-world.tsx Canvas, camera, lights, hills, one Lane per train
  lane.tsx        one train's strip; owns motion, station lifecycle
  track.tsx       recycled track segments
  train.tsx       locomotive + carriage, wheel spin, smoke
  smoke.tsx       puff pool
  scenery.tsx     recycled trees and rocks
  hills.tsx       shared far background with parallax
  station.tsx     platform built from primitives, terminus variant
  character.tsx   billboarded 2D sprite

apps/web/src/routes/session.tsx               full-bleed TrainWorld, seeds local train
apps/web/src/routes/session-dev-panel.tsx     ?dev controls
apps/web/src/app.tsx                          main becomes a relative container
apps/web/public/models/*.glb + LICENSE.md     Kenney assets
apps/web/public/characters/default.svg        placeholder sprite
.llm/architecture.md                          world + scene rows
```

---

### Task 1: Train schemas in shared

**Files:**
- Create: `packages/shared/src/schemas/train.ts`
- Create: `packages/shared/src/schemas/train.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `trainPhaseSchema`, `trainOwnerSchema`, `trainStateSchema`, `worldSnapshotSchema` and types `TrainPhase = "running" | "stopped" | "finished"`, `TrainOwner = { name: string; spriteUrl: string }`, `TrainState = { id: string; owner: TrainOwner; phase: TrainPhase; efficiency: number; lane: number }`, `WorldSnapshot = { trains: Record<string, TrainState>; localTrainId: string | null }`.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/schemas/train.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { trainStateSchema, worldSnapshotSchema } from "./train";

const train = {
  id: "t1",
  owner: { name: "Ada", spriteUrl: "/characters/default.svg" },
  phase: "running",
  efficiency: 0.7,
  lane: 0,
};

describe("trainStateSchema", () => {
  test("accepts a running train", () => {
    expect(trainStateSchema.parse(train)).toEqual(train);
  });

  test("rejects efficiency above 1", () => {
    expect(trainStateSchema.safeParse({ ...train, efficiency: 1.5 }).success).toBe(false);
  });

  test("rejects an unknown phase", () => {
    expect(trainStateSchema.safeParse({ ...train, phase: "flying" }).success).toBe(false);
  });
});

describe("worldSnapshotSchema", () => {
  test("accepts a snapshot keyed by train id", () => {
    const snapshot = { trains: { t1: train }, localTrainId: "t1" };
    expect(worldSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/shared && bun test src/schemas/train.test.ts`
Expected: FAIL, cannot resolve `./train`.

- [ ] **Step 3: Write the schemas**

`packages/shared/src/schemas/train.ts`:

```ts
import { z } from "zod";

// What a train is doing. Drivers set this; the scene animates toward it.
export const trainPhaseSchema = z.enum(["running", "stopped", "finished"]);
export type TrainPhase = z.infer<typeof trainPhaseSchema>;

export const trainOwnerSchema = z.object({
  name: z.string().min(1),
  spriteUrl: z.string(),
});
export type TrainOwner = z.infer<typeof trainOwnerSchema>;

// One train in the world. `efficiency` is the 0..1 study score that affects
// the train; `lane` is which track it runs on, 0 being closest to the camera.
export const trainStateSchema = z.object({
  id: z.string().min(1),
  owner: trainOwnerSchema,
  phase: trainPhaseSchema,
  efficiency: z.number().min(0).max(1),
  lane: z.number().int().nonnegative(),
});
export type TrainState = z.infer<typeof trainStateSchema>;

// The whole world from one client's point of view. Future multiplayer wire format.
export const worldSnapshotSchema = z.object({
  trains: z.record(z.string(), trainStateSchema),
  localTrainId: z.string().nullable(),
});
export type WorldSnapshot = z.infer<typeof worldSnapshotSchema>;
```

Append to `packages/shared/src/index.ts`:

```ts
export * from "./schemas/train";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/shared && bun test src/schemas/train.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Verify and commit**

Run: `bun run fmt && bun run typecheck && bun run test && bun run lint`
Expected: all exit 0.

```bash
git add packages/shared
git commit -m "Add train schemas to shared

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018gCEPnAopPo7CxJ5jc7RPV"
```

---

### Task 2: World store

**Files:**
- Create: `apps/web/src/features/world/speed.ts`
- Create: `apps/web/src/features/world/speed.test.ts`
- Create: `apps/web/src/features/world/store.ts`
- Create: `apps/web/src/features/world/store.test.ts`
- Create: `apps/web/src/features/world/index.ts`
- Modify: `apps/web/package.json` (zustand dependency, via `bun add`)

**Interfaces:**
- Consumes: `TrainPhase`, `TrainState`, `WorldSnapshot` from `@grugchug/shared` (Task 1).
- Produces:
  - `targetSpeed(train: Pick<TrainState, "phase" | "efficiency">): number`, `MIN_SPEED = 2`, `MAX_SPEED = 8`.
  - `useWorld`: zustand hook with state `{ trains: Record<string, TrainState>; localTrainId: string | null }` and commands `addTrain(train)`, `removeTrain(id)`, `setLocalTrainId(id | null)`, `setPhase(id, phase)`, `setEfficiency(id, value)`, `applySnapshot({ trains })`. Outside React use `useWorld.getState()`.
  - `WorldState` type.

- [ ] **Step 1: Install zustand**

Run: `cd apps/web && bun add zustand`
Expected: `apps/web/package.json` gains `"zustand": "^5..."` and `bun.lock` updates.

- [ ] **Step 2: Write the failing speed test**

`apps/web/src/features/world/speed.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { MAX_SPEED, MIN_SPEED, targetSpeed } from "./speed";

describe("targetSpeed", () => {
  test("is zero when stopped or finished", () => {
    expect(targetSpeed({ phase: "stopped", efficiency: 1 })).toBe(0);
    expect(targetSpeed({ phase: "finished", efficiency: 1 })).toBe(0);
  });

  test("spans MIN_SPEED to MAX_SPEED with efficiency", () => {
    expect(targetSpeed({ phase: "running", efficiency: 0 })).toBe(MIN_SPEED);
    expect(targetSpeed({ phase: "running", efficiency: 1 })).toBe(MAX_SPEED);
    expect(targetSpeed({ phase: "running", efficiency: 0.5 })).toBe((MIN_SPEED + MAX_SPEED) / 2);
  });

  test("clamps efficiency outside 0..1", () => {
    expect(targetSpeed({ phase: "running", efficiency: -3 })).toBe(MIN_SPEED);
    expect(targetSpeed({ phase: "running", efficiency: 9 })).toBe(MAX_SPEED);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/web && bun test src/features/world/speed.test.ts`
Expected: FAIL, cannot resolve `./speed`.

- [ ] **Step 4: Write speed.ts**

`apps/web/src/features/world/speed.ts`:

```ts
import type { TrainState } from "@grugchug/shared";

// Metres per second. A running train never drops below MIN_SPEED, so a rough
// study stretch reads as "slow", not "stuck". Replace the mapping here when
// the tracking team has a real efficiency algorithm.
export const MIN_SPEED = 2;
export const MAX_SPEED = 8;

export function targetSpeed(train: Pick<TrainState, "phase" | "efficiency">): number {
  if (train.phase !== "running") return 0;
  const efficiency = Math.min(1, Math.max(0, train.efficiency));
  return MIN_SPEED + (MAX_SPEED - MIN_SPEED) * efficiency;
}
```

- [ ] **Step 5: Run the speed test to verify it passes**

Run: `cd apps/web && bun test src/features/world/speed.test.ts`
Expected: 3 pass.

- [ ] **Step 6: Write the failing store test**

`apps/web/src/features/world/store.test.ts`:

```ts
import { beforeEach, describe, expect, test } from "bun:test";
import type { TrainState } from "@grugchug/shared";
import { useWorld } from "./store";

const local: TrainState = {
  id: "local",
  owner: { name: "You", spriteUrl: "/characters/default.svg" },
  phase: "stopped",
  efficiency: 0.5,
  lane: 0,
};

const friend: TrainState = {
  id: "friend",
  owner: { name: "Ada", spriteUrl: "/characters/default.svg" },
  phase: "running",
  efficiency: 0.8,
  lane: 1,
};

beforeEach(() => {
  useWorld.setState({ trains: {}, localTrainId: null });
});

describe("useWorld", () => {
  test("adds and removes trains", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    expect(useWorld.getState().trains.local).toEqual(local);
    w.removeTrain("local");
    expect(useWorld.getState().trains.local).toBeUndefined();
  });

  test("removing the local train clears localTrainId", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.setLocalTrainId("local");
    w.removeTrain("local");
    expect(useWorld.getState().localTrainId).toBeNull();
  });

  test("sets phase and efficiency on an existing train", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.setPhase("local", "running");
    w.setEfficiency("local", 0.9);
    expect(useWorld.getState().trains.local?.phase).toBe("running");
    expect(useWorld.getState().trains.local?.efficiency).toBe(0.9);
  });

  test("clamps efficiency to 0..1", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.setEfficiency("local", 4);
    expect(useWorld.getState().trains.local?.efficiency).toBe(1);
  });

  test("ignores commands for unknown trains", () => {
    useWorld.getState().setPhase("ghost", "running");
    expect(useWorld.getState().trains).toEqual({});
  });

  test("applySnapshot upserts and removes remote trains but keeps the local one", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.setLocalTrainId("local");
    w.addTrain({ ...friend, id: "gone", lane: 2 });
    w.applySnapshot({
      trains: { friend, local: { ...local, phase: "finished" } },
    });
    const { trains } = useWorld.getState();
    expect(trains.friend).toEqual(friend);
    expect(trains.gone).toBeUndefined();
    expect(trains.local?.phase).toBe("stopped");
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `cd apps/web && bun test src/features/world/store.test.ts`
Expected: FAIL, cannot resolve `./store`.

- [ ] **Step 8: Write store.ts and index.ts**

`apps/web/src/features/world/store.ts`:

```ts
import type { TrainPhase, TrainState, WorldSnapshot } from "@grugchug/shared";
import { create } from "zustand";

export type WorldState = {
  trains: Record<string, TrainState>;
  localTrainId: string | null;
  addTrain: (train: TrainState) => void;
  removeTrain: (id: string) => void;
  setLocalTrainId: (id: string | null) => void;
  setPhase: (id: string, phase: TrainPhase) => void;
  setEfficiency: (id: string, efficiency: number) => void;
  applySnapshot: (snapshot: Pick<WorldSnapshot, "trains">) => void;
};

// Intent only. Eased speeds, scroll offsets, and station positions belong to
// the scene, which reads this store and never writes it.
export const useWorld = create<WorldState>()((set) => ({
  trains: {},
  localTrainId: null,

  addTrain: (train) => set((s) => ({ trains: { ...s.trains, [train.id]: train } })),

  removeTrain: (id) =>
    set((s) => {
      const trains = { ...s.trains };
      delete trains[id];
      return { trains, localTrainId: s.localTrainId === id ? null : s.localTrainId };
    }),

  setLocalTrainId: (id) => set({ localTrainId: id }),

  setPhase: (id, phase) => set((s) => patchTrain(s, id, { phase })),

  setEfficiency: (id, efficiency) =>
    set((s) => patchTrain(s, id, { efficiency: Math.min(1, Math.max(0, efficiency)) })),

  // Remote state wins for every train except ours; trains missing from the
  // snapshot are gone.
  applySnapshot: (snapshot) =>
    set((s) => {
      const trains: Record<string, TrainState> = { ...snapshot.trains };
      const local = s.localTrainId === null ? undefined : s.trains[s.localTrainId];
      if (local) trains[local.id] = local;
      return { trains };
    }),
}));

function patchTrain(s: WorldState, id: string, patch: Partial<TrainState>): Partial<WorldState> {
  const train = s.trains[id];
  if (!train) return {};
  return { trains: { ...s.trains, [id]: { ...train, ...patch } } };
}
```

`apps/web/src/features/world/index.ts`:

```ts
// World state: which trains exist, what each is doing, and how efficiently.
// Pure TypeScript, no three.js. Every driver (session timer, tracking score,
// agent tool calls, multiplayer sync) changes the world through these
// commands. The scene only reads.
export { MAX_SPEED, MIN_SPEED, targetSpeed } from "./speed";
export { useWorld, type WorldState } from "./store";
export type { TrainPhase, TrainState, WorldSnapshot } from "@grugchug/shared";
```

- [ ] **Step 9: Run the store test to verify it passes**

Run: `cd apps/web && bun test src/features/world`
Expected: 9 pass (3 speed, 6 store).

- [ ] **Step 10: Verify and commit**

Run: `bun run fmt && bun run typecheck && bun run test && bun run lint`
Expected: all exit 0.

```bash
git add apps/web/src/features/world apps/web/package.json bun.lock
git commit -m "Add world store with train commands and speed mapping

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018gCEPnAopPo7CxJ5jc7RPV"
```

---

### Task 3: Assets, constants, model registry

**Files:**
- Create: `apps/web/public/models/*.glb` (9 files), `apps/web/public/models/LICENSE.md`
- Create: `apps/web/public/characters/default.svg`
- Create: `apps/web/src/features/scene/constants.ts`
- Create: `apps/web/src/features/scene/models.ts`
- Create: `apps/web/src/features/scene/models.test.ts`
- Delete: `apps/web/public/models/.gitkeep`

**Interfaces:**
- Produces: every constant listed in Step 4, `MODELS` object and `ALL_MODEL_URLS` array in Step 5.

- [ ] **Step 1: Download the Kenney kits**

Run from the repo root:

```bash
mkdir -p /tmp/kenney && cd /tmp/kenney
curl -sL -A "Mozilla/5.0" -o train-kit.zip "https://kenney.nl/media/pages/assets/train-kit/cf8521d625-1727040883/kenney_train-kit.zip"
curl -sL -A "Mozilla/5.0" -o nature-kit.zip "https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip"
unzip -qo train-kit.zip -d train && unzip -qo nature-kit.zip -d nature
ls "train/Models/GLB format" | head -3 && ls "nature/Models/GLTF format" | head -3
```

Expected: both `ls` calls print glb file names. If a URL 404s, the hash changed: open https://kenney.nl/assets/train-kit or https://kenney.nl/assets/nature-kit in a browser, click Download, and unzip into the same folders.

- [ ] **Step 2: Copy the models we use**

```bash
cd /home/ewzheng/Documents/CMU/grugchug
rm -f apps/web/public/models/.gitkeep
T="/tmp/kenney/train/Models/GLB format"; N="/tmp/kenney/nature/Models/GLTF format"
cp "$T/train-locomotive-a.glb" "$T/train-carriage-box.glb" "$T/railroad-straight.glb" apps/web/public/models/
cp "$N/tree_default.glb" "$N/tree_pineTallA.glb" "$N/tree_oak.glb" "$N/rock_smallA.glb" "$N/rock_largeA.glb" "$N/plant_bush.glb" apps/web/public/models/
ls -la apps/web/public/models
```

Expected: 9 glb files, about 340 KB total.

- [ ] **Step 3: Write the license note and placeholder character**

`apps/web/public/models/LICENSE.md`:

```markdown
# Model licenses

All models in this directory are from Kenney (https://kenney.nl), CC0 1.0.

- `train-*.glb`, `railroad-*.glb` — Train Kit 1.1, https://kenney.nl/assets/train-kit
- `tree_*.glb`, `rock_*.glb`, `plant_*.glb` — Nature Kit, https://kenney.nl/assets/nature-kit
```

`apps/web/public/characters/default.svg` (placeholder until hand-drawn sprites land; `width`/`height` are required for three.js to size the texture):

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="180" viewBox="0 0 128 180">
  <circle cx="64" cy="44" r="36" fill="#f5cba7" stroke="#2c3e50" stroke-width="4"/>
  <circle cx="50" cy="40" r="4" fill="#2c3e50"/>
  <circle cx="78" cy="40" r="4" fill="#2c3e50"/>
  <path d="M48 58 Q64 72 80 58" stroke="#2c3e50" stroke-width="4" fill="none" stroke-linecap="round"/>
  <rect x="34" y="84" width="60" height="70" rx="14" fill="#3498db" stroke="#2c3e50" stroke-width="4"/>
</svg>
```

- [ ] **Step 4: Write constants.ts**

`apps/web/src/features/scene/constants.ts`:

```ts
// One scene unit is one metre. Numbers marked "measured" come from the glb
// bounds in docs/plans/2026-09-11-train-world.md.

// Kit models travel along their local +z. The world scrolls along screen +x,
// so every kit model is wrapped in a group with this rotation. Flip the sign
// if the locomotive turns out to face backwards.
export const KIT_ROTATION_Y = Math.PI / 2;

// Lanes
export const LANE_SPACING = 3; // metres deeper into the screen per lane

// Track: railroad-straight.glb is 4 m long with its origin at one end and
// sits 1 m below its origin (measured), so lifting it by 1 puts rail top at 0.1.
export const TRACK_SEGMENT_LENGTH = 4;
export const TRACK_SEGMENTS = 14;
export const TRACK_Y = 1.0;

// Train: wheels touch y=0 in the model (measured); rail top is at 0.1.
export const TRAIN_Y = 0.1;
export const LOCOMOTIVE_HEIGHT = 1.66; // measured
export const CARRIAGE_GAP = 2.9; // half loco (1.30) + half carriage (1.35) + coupling
export const WHEEL_RADIUS = 0.3;

// Motion, metres per second squared
export const ACCEL = 1.5;
export const BRAKE_DECEL = 2;

// Stopping: a station appears this far ahead when a stop is requested.
// Braking distance from MAX_SPEED (8) at BRAKE_DECEL is 16 m, so 20 leaves a
// short cruise before the brakes bite.
export const STATION_DISTANCE = 20;

// Recycling: anything further than this behind the train jumps forward.
export const VISIBLE_HALF_WIDTH = 26;
export const RECYCLE_SPAN = 2 * VISIBLE_HALF_WIDTH;

// Scenery
export const SCENERY_SCALE = 1.5;
export const SCENERY_PER_LANE = 16;
export const SCENERY_MIN_DEPTH = 0.9; // behind the track, so it never covers the train
export const SCENERY_MAX_DEPTH = 2.3;

// Smoke
export const SMOKE_PUFFS = 14;
export const SMOKE_LIFE = 1.6; // seconds
export const CHIMNEY_OFFSET: [number, number, number] = [0.9, LOCOMOTIVE_HEIGHT, 0];

// Character sprite rides on the back of the locomotive
export const CHARACTER_OFFSET: [number, number, number] = [-0.6, LOCOMOTIVE_HEIGHT + 0.75, 0];
export const CHARACTER_SIZE: [number, number] = [1, 1.4];

// Camera
export const CAMERA_POSITION: [number, number, number] = [0, 4, 22];
export const CAMERA_LOOK_AT: [number, number, number] = [0, 1.5, -LANE_SPACING];
export const CAMERA_FOV = 35;

// Sky and hills
export const SKY_COLOR = "#bfe3ff";
export const HILL_DEPTH = -28;
export const HILL_PARALLAX = 0.15;
```

- [ ] **Step 5: Write the failing models test, then models.ts**

`apps/web/src/features/scene/models.test.ts`:

```ts
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { ALL_MODEL_URLS } from "./models";

const publicDir = join(import.meta.dir, "../../../public");

describe("model registry", () => {
  test("every model URL points at a committed file", async () => {
    for (const url of ALL_MODEL_URLS) {
      expect(await Bun.file(join(publicDir, url)).exists()).toBe(true);
    }
  });
});
```

Run: `cd apps/web && bun test src/features/scene/models.test.ts`
Expected: FAIL, cannot resolve `./models`.

`apps/web/src/features/scene/models.ts` (plain data so tests and non-WebGL code can import it):

```ts
export const MODELS = {
  locomotive: "/models/train-locomotive-a.glb",
  carriage: "/models/train-carriage-box.glb",
  track: "/models/railroad-straight.glb",
  scenery: [
    "/models/tree_default.glb",
    "/models/tree_pineTallA.glb",
    "/models/tree_oak.glb",
    "/models/rock_smallA.glb",
    "/models/rock_largeA.glb",
    "/models/plant_bush.glb",
  ],
} as const;

export const ALL_MODEL_URLS: readonly string[] = [
  MODELS.locomotive,
  MODELS.carriage,
  MODELS.track,
  ...MODELS.scenery,
];
```

Run: `cd apps/web && bun test src/features/scene/models.test.ts`
Expected: 1 pass.

- [ ] **Step 6: Verify and commit**

Run: `bun run fmt && bun run typecheck && bun run test && bun run lint`
Expected: all exit 0.

```bash
git add apps/web/public apps/web/src/features/scene
git commit -m "Add Kenney models, scene constants, and model registry

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018gCEPnAopPo7CxJ5jc7RPV"
```

---

### Task 4: Scene skeleton on the session page

A static train on a static track per store train, full-bleed on `/session`. No motion yet.

**Files:**
- Create: `apps/web/src/features/scene/motion.ts`
- Create: `apps/web/src/features/scene/train-world.tsx`
- Create: `apps/web/src/features/scene/lane.tsx`
- Create: `apps/web/src/features/scene/track.tsx`
- Create: `apps/web/src/features/scene/train.tsx`
- Modify: `apps/web/src/features/scene/index.ts`
- Modify: `apps/web/src/routes/session.tsx`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/routes/dashboard.tsx`, `apps/web/src/routes/settings.tsx` (padding moves into pages)

**Interfaces:**
- Consumes: `useWorld` (Task 2), constants and `MODELS` (Task 3).
- Produces:
  - `LaneMotion = { scroll: number; speed: number; stopTarget: number | null }`, `registerMotion(id, motion)`, `unregisterMotion(id)`, `getMotion(id): LaneMotion | undefined`.
  - `Lane({ trainId })` renders `<group position={[0, 0, -lane * LANE_SPACING]}>` and owns a `useRef<LaneMotion>`; children receive `motion: RefObject<LaneMotion>`.
  - `Track({ motion })`, `Train({ trainId, motion })`, `TrainWorld()`.

- [ ] **Step 1: Write motion.ts**

`apps/web/src/features/scene/motion.ts`:

```ts
// Per-frame state for one lane. Lives in a ref, mutated inside useFrame, never
// in React state, so a running world costs zero re-renders.
export type LaneMotion = {
  scroll: number; // metres travelled
  speed: number; // metres per second, eased
  stopTarget: number | null; // scroll value at which the train must rest
};

export function createMotion(): LaneMotion {
  return { scroll: 0, speed: 0, stopTarget: null };
}

// Lets shared elements (the far hills) read the local train's motion without
// prop drilling through the Canvas.
const registry = new Map<string, LaneMotion>();

export function registerMotion(id: string, motion: LaneMotion): void {
  registry.set(id, motion);
}

export function unregisterMotion(id: string): void {
  registry.delete(id);
}

export function getMotion(id: string): LaneMotion | undefined {
  return registry.get(id);
}
```

- [ ] **Step 2: Write track.tsx (static for now)**

`apps/web/src/features/scene/track.tsx`:

```tsx
import { Clone, useGLTF } from "@react-three/drei";
import type { RefObject } from "react";
import { KIT_ROTATION_Y, TRACK_SEGMENT_LENGTH, TRACK_SEGMENTS, TRACK_Y } from "./constants";
import { MODELS } from "./models";
import type { LaneMotion } from "./motion";

type TrackProps = { motion: RefObject<LaneMotion> };

const START = -Math.floor(TRACK_SEGMENTS / 2) * TRACK_SEGMENT_LENGTH;

// Stable ids: Biome rejects array indexes as React keys.
const SEGMENTS = Array.from({ length: TRACK_SEGMENTS }, (_, i) => ({
  id: `segment-${i}`,
  x: START + i * TRACK_SEGMENT_LENGTH,
}));

// Straight segments laid end to end, centred on the train.
export function Track(_props: TrackProps) {
  const { scene } = useGLTF(MODELS.track);
  return (
    <group position-y={TRACK_Y}>
      {SEGMENTS.map((seg) => (
        <group key={seg.id} position-x={seg.x} rotation-y={KIT_ROTATION_Y}>
          <Clone object={scene} />
        </group>
      ))}
    </group>
  );
}
```

- [ ] **Step 3: Write train.tsx (static for now)**

`apps/web/src/features/scene/train.tsx`:

```tsx
import { Clone, useGLTF } from "@react-three/drei";
import type { RefObject } from "react";
import { CARRIAGE_GAP, KIT_ROTATION_Y, TRAIN_Y } from "./constants";
import { MODELS } from "./models";
import type { LaneMotion } from "./motion";

type TrainProps = { trainId: string; motion: RefObject<LaneMotion> };

// Locomotive at the lane origin, one carriage behind it. Faces +x.
export function Train(_props: TrainProps) {
  const locomotive = useGLTF(MODELS.locomotive);
  const carriage = useGLTF(MODELS.carriage);
  return (
    <group position-y={TRAIN_Y}>
      <group rotation-y={KIT_ROTATION_Y}>
        <Clone object={locomotive.scene} />
      </group>
      <group position-x={-CARRIAGE_GAP} rotation-y={KIT_ROTATION_Y}>
        <Clone object={carriage.scene} />
      </group>
    </group>
  );
}
```

- [ ] **Step 4: Write lane.tsx**

`apps/web/src/features/scene/lane.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { useWorld } from "@/features/world";
import { LANE_SPACING } from "./constants";
import { createMotion, registerMotion, unregisterMotion } from "./motion";
import { Track } from "./track";
import { Train } from "./train";

type LaneProps = { trainId: string };

// One train's strip of world. Owns that train's motion state.
export function Lane({ trainId }: LaneProps) {
  const lane = useWorld((s) => s.trains[trainId]?.lane ?? 0);
  const motion = useRef(createMotion());

  useEffect(() => {
    registerMotion(trainId, motion.current);
    return () => unregisterMotion(trainId);
  }, [trainId]);

  return (
    <group position-z={-lane * LANE_SPACING}>
      <Track motion={motion} />
      <Train trainId={trainId} motion={motion} />
    </group>
  );
}
```

- [ ] **Step 5: Write train-world.tsx and the index**

`apps/web/src/features/scene/train-world.tsx`:

```tsx
import { useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { useShallow } from "zustand/react/shallow";
import { useWorld } from "@/features/world";
import { CAMERA_FOV, CAMERA_LOOK_AT, CAMERA_POSITION, SKY_COLOR } from "./constants";
import { Lane } from "./lane";
import { ALL_MODEL_URLS } from "./models";

for (const url of ALL_MODEL_URLS) useGLTF.preload(url);

export function TrainWorld() {
  const trainIds = useWorld(useShallow((s) => Object.keys(s.trains)));
  return (
    <Canvas
      camera={{ position: CAMERA_POSITION, fov: CAMERA_FOV }}
      onCreated={({ camera }) => camera.lookAt(...CAMERA_LOOK_AT)}
      dpr={[1, 1.5]}
    >
      <color attach="background" args={[SKY_COLOR]} />
      <fog attach="fog" args={[SKY_COLOR, 30, 70]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 15, 10]} intensity={1.4} />
      <Suspense fallback={null}>
        {trainIds.map((id) => (
          <Lane key={id} trainId={id} />
        ))}
      </Suspense>
    </Canvas>
  );
}
```

`apps/web/src/features/scene/index.ts`:

```ts
// 3D feedback for a study session: the react-three-fiber canvas, train
// models, and the animation that ties them to the world store. Reads
// features/world, never writes it.
export { TrainWorld } from "./train-world";
```

- [ ] **Step 6: Mount it on the session page**

`apps/web/src/app.tsx`: change the `<main>` element to

```tsx
      <main className="relative flex flex-1 flex-col">
```

`apps/web/src/routes/dashboard.tsx`:

```tsx
export function Dashboard() {
  return <h1 className="p-6 text-2xl font-semibold">Dashboard</h1>;
}
```

`apps/web/src/routes/settings.tsx`:

```tsx
export function Settings() {
  return <h1 className="p-6 text-2xl font-semibold">Settings</h1>;
}
```

`apps/web/src/routes/session.tsx` (seeds the local train until the session feature owns that):

```tsx
import { useEffect } from "react";
import { TrainWorld } from "@/features/scene";
import { useWorld } from "@/features/world";

const LOCAL_TRAIN_ID = "local";

export function Session() {
  const localTrainId = useWorld((s) => s.localTrainId);

  useEffect(() => {
    if (localTrainId !== null) return;
    const w = useWorld.getState();
    w.addTrain({
      id: LOCAL_TRAIN_ID,
      owner: { name: "You", spriteUrl: "/characters/default.svg" },
      phase: "stopped",
      efficiency: 0.7,
      lane: 0,
    });
    w.setLocalTrainId(LOCAL_TRAIN_ID);
  }, [localTrainId]);

  return (
    <div className="absolute inset-0">
      <TrainWorld />
    </div>
  );
}
```

Update the existing test `apps/web/src/routes/dashboard.test.tsx` only if it fails; the heading text is unchanged so it should still pass.

- [ ] **Step 7: Check it in the browser**

Run: `bun run dev` (from the root, leave it running in another terminal), open http://localhost:5173/session.
Expected: sky-blue background, a red locomotive and a box carriage sitting on a straight track, seen from the side, train facing right. If the locomotive's chimney end points left, set `KIT_ROTATION_Y = -Math.PI / 2` in `constants.ts`. No console errors.

- [ ] **Step 8: Verify and commit**

Run: `bun run fmt && bun run typecheck && bun run test && bun run lint && bun run build`
Expected: all exit 0.

```bash
git add apps/web/src
git commit -m "Render a static train per world train on the session page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018gCEPnAopPo7CxJ5jc7RPV"
```

---

### Task 5: Dev panel

Manual controls so every later task can be checked by eye.

**Files:**
- Create: `apps/web/src/routes/session-dev-panel.tsx`
- Modify: `apps/web/src/routes/session.tsx`

**Interfaces:**
- Consumes: `useWorld` commands (Task 2).
- Produces: `SessionDevPanel()` shown when the URL has `?dev`.

- [ ] **Step 1: Write the panel**

`apps/web/src/routes/session-dev-panel.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { type TrainPhase, useWorld } from "@/features/world";

const FRIEND_NAMES = ["Ada", "Grace", "Linus", "Margaret", "Dennis"];
const PHASES: TrainPhase[] = ["running", "stopped", "finished"];

// Drives the world by hand until tracking, the session timer, and the agents
// exist. Friends toggle between running and stopped on their own.
export function SessionDevPanel() {
  const localTrainId = useWorld((s) => s.localTrainId);
  const local = useWorld((s) => (s.localTrainId === null ? undefined : s.trains[s.localTrainId]));
  const trainCount = useWorld((s) => Object.keys(s.trains).length);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);

  useEffect(() => {
    return () => {
      for (const t of timers.current) clearInterval(t);
    };
  }, []);

  if (localTrainId === null || !local) return null;
  const w = useWorld.getState();

  const addFriend = () => {
    const id = `friend-${trainCount}`;
    w.addTrain({
      id,
      owner: {
        name: FRIEND_NAMES[trainCount % FRIEND_NAMES.length] ?? "Friend",
        spriteUrl: "/characters/default.svg",
      },
      phase: "running",
      efficiency: 0.3 + Math.random() * 0.6,
      lane: trainCount,
    });
    const timer = setInterval(
      () => {
        const current = useWorld.getState().trains[id];
        if (!current) return clearInterval(timer);
        w.setPhase(id, current.phase === "running" ? "stopped" : "running");
      },
      8000 + Math.random() * 7000,
    );
    timers.current.push(timer);
  };

  return (
    <div className="absolute top-4 right-4 flex w-56 flex-col gap-3 rounded-lg border bg-background/90 p-4 text-sm shadow">
      <div className="font-semibold">Dev: {local.owner.name}</div>
      <div className="flex gap-2">
        {PHASES.map((phase) => (
          <button
            key={phase}
            type="button"
            onClick={() => w.setPhase(localTrainId, phase)}
            className={
              local.phase === phase
                ? "rounded bg-primary px-2 py-1 text-primary-foreground"
                : "rounded border px-2 py-1"
            }
          >
            {phase}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1">
        efficiency {local.efficiency.toFixed(2)}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={local.efficiency}
          onChange={(e) => w.setEfficiency(localTrainId, Number(e.target.value))}
        />
      </label>
      <button type="button" onClick={addFriend} className="rounded border px-2 py-1">
        add friend train ({trainCount - 1})
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Show it behind `?dev`**

In `apps/web/src/routes/session.tsx`, add the imports

```tsx
import { useSearchParams } from "react-router";
import { SessionDevPanel } from "./session-dev-panel";
```

add inside `Session()` before the `return`:

```tsx
  const [params] = useSearchParams();
  const dev = params.has("dev");
```

and change the returned JSX to:

```tsx
  return (
    <div className="absolute inset-0">
      <TrainWorld />
      {dev ? <SessionDevPanel /> : null}
    </div>
  );
```

- [ ] **Step 3: Check it in the browser**

Open http://localhost:5173/session?dev.
Expected: panel top-right with three phase buttons, a slider, and "add friend train (0)". Clicking "add friend train" adds a second train on a track further from the camera. Phase buttons highlight the active phase. Nothing moves yet.

- [ ] **Step 4: Verify and commit**

Run: `bun run fmt && bun run typecheck && bun run test && bun run lint`
Expected: all exit 0.

```bash
git add apps/web/src/routes
git commit -m "Add dev panel to drive the world from the session page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018gCEPnAopPo7CxJ5jc7RPV"
```

---

### Task 6: Motion: eased speed, scrolling track, wheels, smoke

**Files:**
- Modify: `apps/web/src/features/scene/lane.tsx`
- Modify: `apps/web/src/features/scene/track.tsx`
- Modify: `apps/web/src/features/scene/train.tsx`
- Create: `apps/web/src/features/scene/smoke.tsx`
- Create: `apps/web/src/features/scene/motion.test.ts`
- Modify: `apps/web/src/features/scene/motion.ts`

**Interfaces:**
- Consumes: `LaneMotion`, `targetSpeed`, constants.
- Produces: `stepMotion(motion, cruise, target, dt)` in `motion.ts`, pure and tested. `Smoke({ motion })`.

- [ ] **Step 1: Write the failing motion test**

`apps/web/src/features/scene/motion.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { ACCEL, BRAKE_DECEL } from "./constants";
import { createMotion, stepMotion } from "./motion";

describe("stepMotion", () => {
  test("accelerates toward the target at ACCEL", () => {
    const m = createMotion();
    stepMotion(m, 8, 8, 1);
    expect(m.speed).toBeCloseTo(ACCEL);
    expect(m.scroll).toBeCloseTo(ACCEL);
  });

  test("never overshoots the target", () => {
    const m = createMotion();
    m.speed = 7.9;
    stepMotion(m, 8, 8, 1);
    expect(m.speed).toBe(8);
  });

  test("slows toward a lower target at BRAKE_DECEL", () => {
    const m = createMotion();
    m.speed = 8;
    stepMotion(m, 8, 2, 1);
    expect(m.speed).toBeCloseTo(8 - BRAKE_DECEL);
  });

  test("comes to rest exactly at stopTarget", () => {
    const m = createMotion();
    m.speed = 8;
    m.stopTarget = 20;
    for (let i = 0; i < 600; i++) stepMotion(m, 8, 0, 1 / 60);
    expect(m.scroll).toBe(20);
    expect(m.speed).toBe(0);
  });

  test("keeps cruising while a stop is pending until the brakes must bite", () => {
    const m = createMotion();
    m.speed = 8;
    m.stopTarget = 100;
    stepMotion(m, 8, 0, 1 / 60);
    expect(m.speed).toBe(8);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && bun test src/features/scene/motion.test.ts`
Expected: FAIL, `stepMotion` is not exported.

- [ ] **Step 3: Add stepMotion to motion.ts**

Replace `apps/web/src/features/scene/motion.ts` with:

```ts
import { ACCEL, BRAKE_DECEL } from "./constants";

// Per-frame state for one lane. Lives in a ref, mutated inside useFrame, never
// in React state, so a running world costs zero re-renders.
export type LaneMotion = {
  scroll: number; // metres travelled
  speed: number; // metres per second, eased
  stopTarget: number | null; // scroll value at which the train must rest
};

export function createMotion(): LaneMotion {
  return { scroll: 0, speed: 0, stopTarget: null };
}

// Advances one lane by dt seconds. `cruise` is the speed the train would run
// at if it were running; `target` is what the store asks for now (0 when
// stopped). While a stopTarget is set the train keeps cruising and a
// v = sqrt(2 a d) braking curve brings it to rest exactly there.
export function stepMotion(m: LaneMotion, cruise: number, target: number, dt: number): void {
  const wanted = m.stopTarget === null ? target : cruise;
  let v = m.speed;
  if (v < wanted) v = Math.min(wanted, v + ACCEL * dt);
  else if (v > wanted) v = Math.max(wanted, v - BRAKE_DECEL * dt);

  if (m.stopTarget !== null) {
    const remaining = m.stopTarget - m.scroll;
    v = remaining <= 0 ? 0 : Math.min(v, Math.sqrt(2 * BRAKE_DECEL * remaining));
  }

  m.scroll += v * dt;
  if (m.stopTarget !== null && m.scroll >= m.stopTarget) {
    m.scroll = m.stopTarget;
    v = 0;
  }
  m.speed = v;
}

// Lets shared elements (the far hills) read the local train's motion without
// prop drilling through the Canvas.
const registry = new Map<string, LaneMotion>();

export function registerMotion(id: string, motion: LaneMotion): void {
  registry.set(id, motion);
}

export function unregisterMotion(id: string): void {
  registry.delete(id);
}

export function getMotion(id: string): LaneMotion | undefined {
  return registry.get(id);
}
```

- [ ] **Step 4: Run the motion test to verify it passes**

Run: `cd apps/web && bun test src/features/scene/motion.test.ts`
Expected: 5 pass. The "comes to rest" test relies on the last `if` snapping `scroll` to the target when the braking curve's final step lands on or past it.

- [ ] **Step 5: Drive motion from the lane each frame**

Replace `apps/web/src/features/scene/lane.tsx` with:

```tsx
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { targetSpeed, useWorld } from "@/features/world";
import { LANE_SPACING } from "./constants";
import { createMotion, registerMotion, stepMotion, unregisterMotion } from "./motion";
import { Track } from "./track";
import { Train } from "./train";

type LaneProps = { trainId: string };

// One train's strip of world. Owns that train's motion state.
export function Lane({ trainId }: LaneProps) {
  const lane = useWorld((s) => s.trains[trainId]?.lane ?? 0);
  const motion = useRef(createMotion());

  useEffect(() => {
    registerMotion(trainId, motion.current);
    return () => unregisterMotion(trainId);
  }, [trainId]);

  useFrame((_, dt) => {
    const train = useWorld.getState().trains[trainId];
    if (!train) return;
    const cruise = targetSpeed({ phase: "running", efficiency: train.efficiency });
    stepMotion(motion.current, cruise, targetSpeed(train), Math.min(dt, 0.1));
  });

  return (
    <group position-z={-lane * LANE_SPACING}>
      <Track motion={motion} />
      <Train trainId={trainId} motion={motion} />
    </group>
  );
}
```

- [ ] **Step 6: Scroll and recycle the track**

Replace `apps/web/src/features/scene/track.tsx` with:

```tsx
import { Clone, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type RefObject, useRef } from "react";
import type { Group } from "three";
import {
  KIT_ROTATION_Y,
  TRACK_SEGMENT_LENGTH,
  TRACK_SEGMENTS,
  TRACK_Y,
  VISIBLE_HALF_WIDTH,
} from "./constants";
import { MODELS } from "./models";
import type { LaneMotion } from "./motion";

type TrackProps = { motion: RefObject<LaneMotion> };

const RUN_LENGTH = TRACK_SEGMENTS * TRACK_SEGMENT_LENGTH;
const START = -Math.floor(TRACK_SEGMENTS / 2) * TRACK_SEGMENT_LENGTH;

// Stable ids: Biome rejects array indexes as React keys.
const SEGMENTS = Array.from({ length: TRACK_SEGMENTS }, (_, i) => ({
  id: `segment-${i}`,
  x: START + i * TRACK_SEGMENT_LENGTH,
}));

// Straight segments laid end to end. Each keeps a world x; on screen it sits
// at worldX - scroll, and once it is far enough behind it jumps to the front.
export function Track({ motion }: TrackProps) {
  const { scene } = useGLTF(MODELS.track);
  const worldX = useRef(SEGMENTS.map((seg) => seg.x));
  const groups = useRef<(Group | null)[]>([]);

  useFrame(() => {
    const scroll = motion.current.scroll;
    for (let i = 0; i < TRACK_SEGMENTS; i++) {
      let x = (worldX.current[i] ?? 0) - scroll;
      if (x + TRACK_SEGMENT_LENGTH < -VISIBLE_HALF_WIDTH) {
        worldX.current[i] = (worldX.current[i] ?? 0) + RUN_LENGTH;
        x += RUN_LENGTH;
      }
      const g = groups.current[i];
      if (g) g.position.x = x;
    }
  });

  return (
    <group position-y={TRACK_Y}>
      {SEGMENTS.map((seg, i) => (
        <group
          key={seg.id}
          ref={(g) => {
            groups.current[i] = g;
          }}
          position-x={seg.x}
          rotation-y={KIT_ROTATION_Y}
        >
          <Clone object={scene} />
        </group>
      ))}
    </group>
  );
}
```

- [ ] **Step 7: Spin the wheels and add smoke**

`apps/web/src/features/scene/smoke.tsx`:

```tsx
import { useFrame } from "@react-three/fiber";
import { type RefObject, useRef } from "react";
import type { Mesh } from "three";
import { CHIMNEY_OFFSET, SMOKE_LIFE, SMOKE_PUFFS } from "./constants";
import type { LaneMotion } from "./motion";

type SmokeProps = { motion: RefObject<LaneMotion> };

type Puff = { id: string; age: number; alive: boolean; drift: number };

// A small pool of puffs. Spawn rate follows speed, so a stopped train is quiet.
export function Smoke({ motion }: SmokeProps) {
  const puffs = useRef<Puff[]>(
    Array.from({ length: SMOKE_PUFFS }, (_, i) => ({
      id: `puff-${i}`,
      age: 0,
      alive: false,
      drift: 0,
    })),
  );
  const meshes = useRef<(Mesh | null)[]>([]);
  const sinceSpawn = useRef(0);

  useFrame((_, dt) => {
    const speed = motion.current.speed;
    sinceSpawn.current += dt;
    const interval = speed > 0.2 ? 1.2 / speed : Number.POSITIVE_INFINITY;
    if (sinceSpawn.current > interval) {
      sinceSpawn.current = 0;
      const free = puffs.current.find((p) => !p.alive);
      if (free) {
        free.alive = true;
        free.age = 0;
        free.drift = (Math.random() - 0.5) * 0.4;
      }
    }
    puffs.current.forEach((p, i) => {
      const mesh = meshes.current[i];
      if (!mesh) return;
      if (!p.alive) {
        mesh.visible = false;
        return;
      }
      p.age += dt;
      if (p.age > SMOKE_LIFE) {
        p.alive = false;
        mesh.visible = false;
        return;
      }
      const t = p.age / SMOKE_LIFE;
      mesh.visible = true;
      mesh.position.set(-t * speed * 0.6 + p.drift, t * 1.8, 0);
      const s = 0.15 + t * 0.45;
      mesh.scale.set(s, s, s);
    });
  });

  return (
    <group position={CHIMNEY_OFFSET}>
      {puffs.current.map((p, i) => (
        <mesh
          key={p.id}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          visible={false}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color="#eeeeee" transparent opacity={0.6} />
        </mesh>
      ))}
    </group>
  );
}
```

Replace `apps/web/src/features/scene/train.tsx` with:

```tsx
import { Clone, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useRef } from "react";
import type { Group, Object3D } from "three";
import { CARRIAGE_GAP, KIT_ROTATION_Y, TRAIN_Y, WHEEL_RADIUS } from "./constants";
import { MODELS } from "./models";
import type { LaneMotion } from "./motion";
import { Smoke } from "./smoke";

type TrainProps = { trainId: string; motion: RefObject<LaneMotion> };

// Locomotive at the lane origin, one carriage behind it. Faces +x. Wheel
// nodes in the Kenney models are named "wheel" or "wheels-*"; they spin about
// their local x, the axle.
export function Train({ motion }: TrainProps) {
  const locomotive = useGLTF(MODELS.locomotive);
  const carriage = useGLTF(MODELS.carriage);
  const root = useRef<Group>(null);
  const wheels = useRef<Object3D[]>([]);

  useEffect(() => {
    const found: Object3D[] = [];
    root.current?.traverse((o) => {
      if (o.name.startsWith("wheel")) found.push(o);
    });
    wheels.current = found;
  }, []);

  useFrame((_, dt) => {
    const spin = (motion.current.speed * dt) / WHEEL_RADIUS;
    for (const w of wheels.current) w.rotation.x += spin;
  });

  return (
    <group ref={root} position-y={TRAIN_Y}>
      <group rotation-y={KIT_ROTATION_Y}>
        <Clone object={locomotive.scene} />
      </group>
      <group position-x={-CARRIAGE_GAP} rotation-y={KIT_ROTATION_Y}>
        <Clone object={carriage.scene} />
      </group>
      <Smoke motion={motion} />
    </group>
  );
}
```

Note `trainId` is no longer read here; keep it in the props type for the character in Task 9, and destructure only `motion` so Biome's unused-variable rule stays quiet.

- [ ] **Step 8: Check it in the browser**

Open http://localhost:5173/session?dev, click `running`.
Expected: the track scrolls right-to-left with no gaps or pops, wheels turn, puffs rise from the chimney and trail backwards. Dragging efficiency changes speed and puff rate. Clicking `stopped` slows the train to a halt (no station yet). If wheels spin the wrong way, negate `spin`. If the track shows a seam, lower `TRACK_SEGMENT_LENGTH` by 0.01 in `constants.ts`.

- [ ] **Step 9: Verify and commit**

Run: `bun run fmt && bun run typecheck && bun run test && bun run lint`
Expected: all exit 0.

```bash
git add apps/web/src/features/scene
git commit -m "Animate trains: eased speed, scrolling track, wheels, smoke

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018gCEPnAopPo7CxJ5jc7RPV"
```

---

### Task 7: Scenery and far hills

**Files:**
- Create: `apps/web/src/features/scene/scenery.tsx`
- Create: `apps/web/src/features/scene/hills.tsx`
- Modify: `apps/web/src/features/scene/lane.tsx`
- Modify: `apps/web/src/features/scene/train-world.tsx`

**Interfaces:**
- Consumes: `LaneMotion`, `getMotion`, constants, `MODELS.scenery`.
- Produces: `Scenery({ motion })` per lane, `Hills()` shared.

- [ ] **Step 1: Write scenery.tsx**

`apps/web/src/features/scene/scenery.tsx`:

```tsx
import { Clone, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type RefObject, useMemo, useRef } from "react";
import type { Group } from "three";
import {
  RECYCLE_SPAN,
  SCENERY_MAX_DEPTH,
  SCENERY_MIN_DEPTH,
  SCENERY_PER_LANE,
  SCENERY_SCALE,
  VISIBLE_HALF_WIDTH,
} from "./constants";
import { MODELS } from "./models";
import type { LaneMotion } from "./motion";

type SceneryProps = { motion: RefObject<LaneMotion> };

type Slot = { id: string; model: number; worldX: number; z: number; yaw: number };

// A fixed pool of trees and rocks behind the track. Each slot keeps a world x
// and jumps forward by RECYCLE_SPAN once it scrolls out of view.
export function Scenery({ motion }: SceneryProps) {
  // useGLTF accepts an array and returns one GLTF per URL, in order.
  const scenes = useGLTF([...MODELS.scenery]).map((gltf) => gltf.scene);
  const slots = useMemo<Slot[]>(
    () =>
      Array.from({ length: SCENERY_PER_LANE }, (_, i) => ({
        id: `slot-${i}`,
        model: Math.floor(Math.random() * MODELS.scenery.length),
        worldX: -VISIBLE_HALF_WIDTH + Math.random() * RECYCLE_SPAN,
        z: -(SCENERY_MIN_DEPTH + Math.random() * (SCENERY_MAX_DEPTH - SCENERY_MIN_DEPTH)),
        yaw: Math.random() * Math.PI * 2,
      })),
    [],
  );
  const groups = useRef<(Group | null)[]>([]);

  useFrame(() => {
    const scroll = motion.current.scroll;
    slots.forEach((slot, i) => {
      let x = slot.worldX - scroll;
      if (x < -VISIBLE_HALF_WIDTH) {
        slot.worldX += RECYCLE_SPAN;
        x += RECYCLE_SPAN;
      }
      const g = groups.current[i];
      if (g) g.position.x = x;
    });
  });

  return (
    <group>
      {slots.map((slot, i) => (
        <group
          key={slot.id}
          ref={(g) => {
            groups.current[i] = g;
          }}
          position={[slot.worldX, 0, slot.z]}
          rotation-y={slot.yaw}
          scale={SCENERY_SCALE}
        >
          <Clone object={scenes[slot.model] ?? scenes[0]} />
        </group>
      ))}
    </group>
  );
}
```

`scenes[0]` is only a type-level fallback; `MODELS.scenery` is non-empty. If TypeScript complains that `scenes[0]` may be undefined for `Clone`'s `object` prop, use `scenes[slot.model] as Object3D` with `import type { Object3D } from "three"` instead.

- [ ] **Step 2: Write hills.tsx**

`apps/web/src/features/scene/hills.tsx`:

```tsx
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { useWorld } from "@/features/world";
import { HILL_DEPTH, HILL_PARALLAX, RECYCLE_SPAN, VISIBLE_HALF_WIDTH } from "./constants";
import { getMotion } from "./motion";

const HILLS = [
  { id: "hill-a", x: -30, r: 14, color: "#7fb069" },
  { id: "hill-b", x: -8, r: 18, color: "#6a9c5b" },
  { id: "hill-c", x: 16, r: 12, color: "#7fb069" },
  { id: "hill-d", x: 36, r: 16, color: "#6a9c5b" },
];
const HILL_SPAN = RECYCLE_SPAN * 2;

// Big flat-shaded domes far behind every lane. They parallax off the local
// train so the world clearly stops when you do.
export function Hills() {
  const localTrainId = useWorld((s) => s.localTrainId);
  const groups = useRef<(Group | null)[]>([]);
  const worldX = useRef(HILLS.map((h) => h.x));

  useFrame(() => {
    const motion = localTrainId === null ? undefined : getMotion(localTrainId);
    const scroll = (motion?.scroll ?? 0) * HILL_PARALLAX;
    HILLS.forEach((_, i) => {
      let x = (worldX.current[i] ?? 0) - scroll;
      if (x < -VISIBLE_HALF_WIDTH * 2) {
        worldX.current[i] = (worldX.current[i] ?? 0) + HILL_SPAN;
        x += HILL_SPAN;
      }
      const g = groups.current[i];
      if (g) g.position.x = x;
    });
  });

  return (
    <group position={[0, -4, HILL_DEPTH]}>
      {HILLS.map((h, i) => (
        <group
          key={h.id}
          ref={(g) => {
            groups.current[i] = g;
          }}
          position-x={h.x}
        >
          <mesh>
            <sphereGeometry args={[h.r, 12, 8]} />
            <meshStandardMaterial color={h.color} flatShading />
          </mesh>
        </group>
      ))}
      <mesh rotation-x={-Math.PI / 2} position-y={4}>
        <planeGeometry args={[400, 120]} />
        <meshStandardMaterial color="#9bc47f" />
      </mesh>
    </group>
  );
}
```

- [ ] **Step 3: Mount both**

In `apps/web/src/features/scene/lane.tsx` add `import { Scenery } from "./scenery";` and render `<Scenery motion={motion} />` inside the lane group after `<Track motion={motion} />`.

In `apps/web/src/features/scene/train-world.tsx` add `import { Hills } from "./hills";` and render `<Hills />` inside the `Suspense`, before the lanes.

- [ ] **Step 4: Check it in the browser**

Open http://localhost:5173/session?dev, click `running`.
Expected: trees and rocks behind the track scroll with it and never pop in the visible area; green hills drift slowly behind everything; a ground plane fills below. Add a friend train: its lane has its own scenery moving at its own speed. Click `stopped` on yours: your scenery and the hills stop, the friend's keeps going. If hills pop, raise the `-VISIBLE_HALF_WIDTH * 2` threshold in `hills.tsx`.

- [ ] **Step 5: Verify and commit**

Run: `bun run fmt && bun run typecheck && bun run test && bun run lint`
Expected: all exit 0.

```bash
git add apps/web/src/features/scene
git commit -m "Add recycled scenery per lane and shared parallax hills

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018gCEPnAopPo7CxJ5jc7RPV"
```

---

### Task 8: Stations and the stop, depart, finish behaviour

**Files:**
- Create: `apps/web/src/features/scene/station.tsx`
- Modify: `apps/web/src/features/scene/lane.tsx`

**Interfaces:**
- Consumes: `LaneMotion.stopTarget`, `stepMotion` (Task 6), `TrainPhase`.
- Produces: `Station({ motion, worldX, terminus })`.

- [ ] **Step 1: Write station.tsx**

`apps/web/src/features/scene/station.tsx`:

```tsx
import { useFrame } from "@react-three/fiber";
import { type RefObject, useRef } from "react";
import type { Group } from "three";
import type { LaneMotion } from "./motion";

type StationProps = { motion: RefObject<LaneMotion>; worldX: number; terminus: boolean };

// A platform behind the track, built from primitives. The train's origin
// lines up with the platform centre when it stops. Terminus stations get a
// buffer stop and a darker roof.
export function Station({ motion, worldX, terminus }: StationProps) {
  const group = useRef<Group>(null);

  useFrame(() => {
    if (group.current) group.current.position.x = worldX - motion.current.scroll;
  });

  const roof = terminus ? "#7f1d1d" : "#b45309";
  return (
    <group ref={group} position={[worldX, 0, -1.2]}>
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[9, 0.7, 1.6]} />
        <meshStandardMaterial color="#d6d3d1" />
      </mesh>
      {[-3.5, 0, 3.5].map((x) => (
        <mesh key={x} position={[x, 1.9, -0.5]}>
          <boxGeometry args={[0.16, 2.4, 0.16]} />
          <meshStandardMaterial color="#57534e" />
        </mesh>
      ))}
      <mesh position={[0, 3.2, -0.3]}>
        <boxGeometry args={[9.4, 0.18, 1.8]} />
        <meshStandardMaterial color={roof} />
      </mesh>
      <mesh position={[0, 2.35, -0.95]}>
        <boxGeometry args={[2.2, 0.5, 0.05]} />
        <meshStandardMaterial color="#fafaf9" />
      </mesh>
      {terminus ? (
        <mesh position={[5.6, 0.85, 1.2]}>
          <boxGeometry args={[0.4, 0.9, 1.2]} />
          <meshStandardMaterial color="#292524" />
        </mesh>
      ) : null}
    </group>
  );
}
```

- [ ] **Step 2: Manage the station from the lane**

Replace `apps/web/src/features/scene/lane.tsx` with:

```tsx
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { targetSpeed, useWorld } from "@/features/world";
import { LANE_SPACING, STATION_DISTANCE, VISIBLE_HALF_WIDTH } from "./constants";
import { createMotion, registerMotion, stepMotion, unregisterMotion } from "./motion";
import { Scenery } from "./scenery";
import { Station } from "./station";
import { Track } from "./track";
import { Train } from "./train";

type LaneProps = { trainId: string };

type StationSpot = { worldX: number; terminus: boolean };

// One train's strip of world. Owns that train's motion state and decides
// when a station exists.
export function Lane({ trainId }: LaneProps) {
  const lane = useWorld((s) => s.trains[trainId]?.lane ?? 0);
  const phase = useWorld((s) => s.trains[trainId]?.phase);
  const motion = useRef(createMotion());
  const [station, setStation] = useState<StationSpot | null>(null);

  useEffect(() => {
    registerMotion(trainId, motion.current);
    return () => unregisterMotion(trainId);
  }, [trainId]);

  // Phase changes are the only thing that creates or releases a stop target.
  useEffect(() => {
    const m = motion.current;
    if (phase === "running" || phase === undefined) {
      m.stopTarget = null;
      return;
    }
    const terminus = phase === "finished";
    if (m.stopTarget !== null) {
      setStation((s) => (s ? { ...s, terminus } : s));
      return;
    }
    // A train that is already standing still gets its station right here.
    const distance = m.speed < 0.01 ? 0 : STATION_DISTANCE;
    m.stopTarget = m.scroll + distance;
    setStation({ worldX: m.stopTarget, terminus });
  }, [phase]);

  useFrame((_, dt) => {
    const train = useWorld.getState().trains[trainId];
    if (!train) return;
    const cruise = targetSpeed({ phase: "running", efficiency: train.efficiency });
    stepMotion(motion.current, cruise, targetSpeed(train), Math.min(dt, 0.1));
    if (station && station.worldX - motion.current.scroll < -VISIBLE_HALF_WIDTH) {
      setStation(null);
    }
  });

  return (
    <group position-z={-lane * LANE_SPACING}>
      <Track motion={motion} />
      <Scenery motion={motion} />
      {station ? <Station motion={motion} worldX={station.worldX} terminus={station.terminus} /> : null}
      <Train trainId={trainId} motion={motion} />
    </group>
  );
}
```

- [ ] **Step 3: Check it in the browser**

Open http://localhost:5173/session?dev.
Expected on load: the train stands at a station (phase starts `stopped`, speed 0, so the station spawns at the train). Click `running`: it pulls out, the station slides off left, and is removed once out of view. Click `stopped` while running: a station slides in from the right, the train coasts then brakes and rests with its locomotive centred on the platform. Click `running` before it arrives: the brakes release and the station slides away. Click `finished`: same as stopped but the roof is dark red and a buffer sits at the far end of the platform. Friend trains do all of this on their own timers.

- [ ] **Step 4: Verify and commit**

Run: `bun run fmt && bun run typecheck && bun run test && bun run lint`
Expected: all exit 0.

```bash
git add apps/web/src/features/scene
git commit -m "Add stations and stop, depart, finish behaviour per lane

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018gCEPnAopPo7CxJ5jc7RPV"
```

---

### Task 9: Character sprites

**Files:**
- Create: `apps/web/src/features/scene/character.tsx`
- Modify: `apps/web/src/features/scene/train.tsx`

**Interfaces:**
- Consumes: `TrainState.owner.spriteUrl`, `CHARACTER_OFFSET`, `CHARACTER_SIZE`.
- Produces: `Character({ url })`.

- [ ] **Step 1: Write character.tsx**

`apps/web/src/features/scene/character.tsx`:

```tsx
import { Billboard, useTexture } from "@react-three/drei";
import { SRGBColorSpace } from "three";
import { CHARACTER_OFFSET, CHARACTER_SIZE } from "./constants";

type CharacterProps = { url: string };

// A hand-drawn 2D sprite that always faces the camera. Any PNG or SVG with
// width/height attributes works; swap the URL, not the code.
export function Character({ url }: CharacterProps) {
  const texture = useTexture(url);
  texture.colorSpace = SRGBColorSpace;
  return (
    <Billboard position={CHARACTER_OFFSET}>
      <mesh>
        <planeGeometry args={CHARACTER_SIZE} />
        <meshBasicMaterial map={texture} transparent alphaTest={0.5} />
      </mesh>
    </Billboard>
  );
}
```

- [ ] **Step 2: Put the owner on the train**

In `apps/web/src/features/scene/train.tsx`:

- add `import { useWorld } from "@/features/world";` and `import { Character } from "./character";`
- change the signature to `export function Train({ trainId, motion }: TrainProps) {`
- add `const spriteUrl = useWorld((s) => s.trains[trainId]?.owner.spriteUrl);` at the top of the body
- render `{spriteUrl ? <Character url={spriteUrl} /> : null}` inside the root group after `<Smoke motion={motion} />`.

- [ ] **Step 3: Check it in the browser**

Open http://localhost:5173/session?dev.
Expected: the placeholder face-and-shirt sprite stands on the back of the locomotive, facing the camera, moving with the train. Friend trains show one too. Drop a PNG into `apps/web/public/characters/` and change the `spriteUrl` in `session.tsx` to confirm it swaps with no other change.

- [ ] **Step 4: Verify and commit**

Run: `bun run fmt && bun run typecheck && bun run test && bun run lint`
Expected: all exit 0.

```bash
git add apps/web/src/features/scene
git commit -m "Add billboarded character sprites riding each train

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018gCEPnAopPo7CxJ5jc7RPV"
```

---

### Task 10: Docs and final verification

**Files:**
- Modify: `.llm/architecture.md`
- Modify: `.llm/AGENTS.md`

- [ ] **Step 1: Update architecture.md**

In `.llm/architecture.md`, in the `apps/web` table, replace the `src/features/scene/` row with these two rows:

```markdown
| `src/features/world/` | zustand store of trains, phases, efficiency; command API every driver uses. No three.js |
| `src/features/scene/` | react-three-fiber rendering of the world store: one scrolling lane per train, stations, scenery, sprites. Never writes the store |
```

Replace the paragraph starting "Data flows one way" with:

```markdown
Data flows one way: `gaze` and `typing` produce samples, `session` collects
and persists them and drives `world` commands, `scene` renders `world`.
`world` is pure TypeScript, so anything can drive it without WebGL: the
session timer, a tracking score, an agent tool call routed through the API,
or a multiplayer sync calling `applySnapshot`.
```

Add to the `packages/shared` table:

```markdown
| `train` | `TrainPhase`, `TrainState` (id, owner, phase, efficiency, lane), `WorldSnapshot` |
```

In the `## Deferred` list, replace the "Real train models" line with:

```markdown
- Efficiency algorithm: `features/world/speed.ts` maps efficiency to speed linearly until tracking has a real score.
- Multiplayer transport: a network module that calls `applySnapshot`.
```

- [ ] **Step 2: Update AGENTS.md**

In `.llm/AGENTS.md` under `## Commands`, add:

```markdown
- `/session?dev` in the browser — dev panel to drive trains by hand
```

Under `## Conventions`, add:

```markdown
- `features/world` never imports three.js. `features/scene` never writes the
  store. Per-frame animation state lives in refs, not React state.
- Scene numbers live in `features/scene/constants.ts`. Tune there, not inline.
```

- [ ] **Step 3: Full verification**

Run: `bun run fmt && bun run typecheck && bun run test && bun run lint && bun run build`
Expected: all exit 0. Test count: 4 shared train + 2 shared gaze + 1 api + 1 dashboard + 3 speed + 6 store + 1 models + 5 motion = 23 across the three packages.

Open http://localhost:5173/session?dev one last time and run through: load at station, run, stop, run before arrival, stop, finish, add two friends, watch for ten seconds. Expected: no console errors, steady frame rate, no popping.

- [ ] **Step 4: Commit**

```bash
git add .llm
git commit -m "Document world and scene modules

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018gCEPnAopPo7CxJ5jc7RPV"
```

Do not push. The user decides when the branch goes up.
