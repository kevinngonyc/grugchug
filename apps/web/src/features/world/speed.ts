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
