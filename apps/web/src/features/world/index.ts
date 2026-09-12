// World state: which trains exist, what each is doing, and how efficiently.
// Pure TypeScript, no three.js. Every driver (session timer, tracking score,
// agent tool calls, multiplayer sync) changes the world through these
// commands. The scene only reads.

export type {
  TrainPhase,
  TrainState,
  WorldSnapshot,
} from "@grugchug/shared";
export { MAX_SPEED, MIN_SPEED, targetSpeed } from "./speed";
export { useWorld, type WorldState } from "./store";
