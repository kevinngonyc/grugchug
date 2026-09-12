# Train world

The visual core of grugchug. While you study, your train runs through a
low-poly world. When you take a break, a station slides in and the train stops
there. Friends studying with you have their own trains alongside yours.

This spec covers the world state, the 3D scene, and the dev controls needed to
build it before tracking, the Gemini conductors, or networking exist.
Multiplayer transport is a separate spec; this design makes room for it.

## Decisions

- Side view, 2.5D. Fixed camera beside the tracks.
- Open journey. Stations appear on demand when a train stops. No planned route.
- A world store with a command API drives the scene. Every driver (session
  timer, tracking score, agent tool calls, network sync) goes through the same
  commands. The scene only renders.
- Each train's lane is its own scrolling strip, so trains stay alongside each
  other regardless of who is stopped.
- Efficiency, a 0..1 scalar per train, affects the train. Today it maps to
  speed. The mapping is one pure function, replaced when the tracking team
  has a real algorithm.
- Models are Kenney CC0 low-poly kits. Characters are hand-drawn 2D sprites
  rendered as camera-facing billboards.

## State (`packages/shared`)

```ts
TrainPhase    = "running" | "stopped" | "finished"
TrainState    = { id, owner: { name, spriteUrl }, phase, efficiency: 0..1, lane }
WorldSnapshot = { trains: Record<id, TrainState>, localTrainId }
```

These are zod schemas. `WorldSnapshot` is the future multiplayer wire format.

## World store (`apps/web/src/features/world`)

zustand store, no three.js imports.

Commands:

- `addTrain(train)`, `removeTrain(id)`
- `setPhase(id, phase)`
- `setEfficiency(id, value)`
- `applySnapshot(snapshot)` — upserts every train in the snapshot and removes
  trains absent from it, never touching the local train

Derived: `targetSpeed(train)` from `speed.ts`. Linear in efficiency with a
floor so a running train never crawls to a stop. Stopped and finished trains
have target speed 0.

The store holds intent only. Animation progress, eased speed, and station
positions live in the scene.

## Scene (`apps/web/src/features/scene`)

| File | Responsibility |
|---|---|
| `train-world.tsx` | Canvas, fixed side camera, lights, shared sky and far hills, one `Lane` per train |
| `lane.tsx` | One train's strip: track, near scenery, station. Eases actual speed toward the store's target and handles stop/depart |
| `train.tsx` | Train glb, wheel rotation and smoke rate tied to speed |
| `station.tsx` | Platform glb; terminus variant for `finished` |
| `scenery.tsx` | Instanced trees and hills, recycled as they scroll off screen |
| `character.tsx` | Billboarded 2D sprite from a URL |
| `track.tsx` | Recycled straight track segments |
| `smoke.tsx` | Puff pool whose spawn rate follows speed |
| `hills.tsx` | Shared far background, parallax off the local train |
| `motion.ts` | Per-lane motion state in a ref, the eased-speed and braking step, and a registry so shared elements can read the local train |
| `models.ts` | Model URLs |
| `constants.ts` | Lane spacing, camera, station distance, speed limits. One scene unit is one meter |

Behaviour:

- Every train sits near screen center on its own lane at a depth offset. Lane
  0 is the local user's, closest to the camera.
- Speed is eased toward the target so phase changes never snap.
- On `stopped`, the lane spawns a station a fixed distance ahead and solves
  the deceleration so the train rests at the platform. On `running`, the train
  pulls out and the station scrolls off behind.
- On `finished`, same as stopped with a terminus station, and scenery stops
  spawning.
- Each train's owner sprite rides on its train.

Nothing in `scene` writes to the store.

## Assets

- `public/models/` — Kenney Train Kit and Nature Kit glb files, preloaded with
  drei `useGLTF`.
- `public/characters/` — PNG sprites. `Character` takes a URL; drawings drop
  in with no code change.

## Dev controls

The session page shows a dev panel when the URL has `?dev`: run, stop, and
finish buttons for the local train, an efficiency slider, and an "add friend
train" button that seeds another lane with random phase changes.

## Testing

- `bun test` covers the store commands and the speed mapping.
- Scene components have no unit tests; WebGL is unavailable in happy-dom. The
  dev panel is the manual check.

## Out of scope

- Multiplayer transport, rooms, presence. Arrives as a network module that
  calls `applySnapshot`.
- The efficiency algorithm.
- Agent tool-call routing. Agents will end up calling world commands through
  the API; that plumbing is its own spec.
- Time of day, weather, and other ambience.

## Deviations (recorded after implementation)

- `station.tsx` builds the platform from primitives, not a glb. The Kenney
  Train Kit has no station model.
- `scenery.tsx` and `track.tsx` use drei `Clone` rather than instancing.
  Around 76 draw calls per lane; instancing is the first optimisation if
  frame rate suffers alongside webcam inference.
- "Scenery stops spawning on `finished`" is not implemented separately: a
  finished train's scroll freezes, so nothing recycles anyway.
- `setLocalTrainId(id)` was added to the world commands; the hills parallax
  off the local train and the dev panel needs to know which train is ours.
- The Train Kit glbs reference `Textures/colormap.png` by relative path rather
  than embedding it; the atlas is committed beside them.
- All lanes share the local train's scroll instead of each lane owning its own
  motion. Friends' trains stay in line with yours, so no rails slide against
  each other. Only the local lane spawns stations; a friend's break is not
  shown in the scene yet.
- The camera sits on the far side of the track, close in, so the train runs
  right to left with friends' lanes behind it.
- The conductor sprite rides every locomotive; the owner's sprite rides in the
  carriage.
