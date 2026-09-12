// Every rider on screen gets a colour of their own, so a ring, a leaderboard
// row and a name can be matched at a glance. You are always the first colour;
// everyone else takes the rest in lane order (the order their trains sit in),
// so colours only shift when someone ahead of them leaves.
import type { TrainState } from "@grugchug/shared";

export const PLAYER_COLORS = [
  "#2563eb", // blue
  "#e11d48", // rose
  "#16a34a", // green
  "#d97706", // amber
  "#9333ea", // purple
  "#0891b2", // cyan
] as const;

export function assignColors(
  trains: readonly TrainState[],
  localTrainId: string | null,
): Map<string, string> {
  const colors = new Map<string, string>();
  const others = trains
    .filter((train) => train.id !== localTrainId)
    .sort((a, b) => a.lane - b.lane || a.id.localeCompare(b.id));

  if (localTrainId !== null && trains.some((train) => train.id === localTrainId)) {
    colors.set(localTrainId, PLAYER_COLORS[0]);
  }
  others.forEach((train, i) => {
    // Past the palette, wrap around the others' colours and leave yours alone.
    const index = 1 + (i % (PLAYER_COLORS.length - 1));
    colors.set(train.id, PLAYER_COLORS[index] ?? PLAYER_COLORS[1]);
  });
  return colors;
}
