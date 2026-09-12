import type { TrainState } from "@grugchug/shared";

// Metres per second. `efficiency` is the study score as a 0..1 fraction, put
// here by `features/session`; a running train never drops below MIN_SPEED, so
// a rough study stretch reads as "slow", not "stuck". This mapping is the
// single place focus turns into motion — change the feel here.
// A crawl: unmistakably moving, unmistakably not getting anywhere.
export const MIN_SPEED = 1;
// Twelve times the crawl, so locked in looks nothing like distracted.
// Raising this past ~12 wants a longer STATION_DISTANCE in features/scene to
// keep stops smooth — see the note there.
export const MAX_SPEED = 12;

export function targetSpeed(train: Pick<TrainState, "phase" | "efficiency">): number {
  if (train.phase !== "running") return 0;
  const efficiency = Math.min(1, Math.max(0, train.efficiency));
  return MIN_SPEED + (MAX_SPEED - MIN_SPEED) * efficiency;
}
