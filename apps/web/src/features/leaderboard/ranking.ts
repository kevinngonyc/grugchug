// Pure ordering and formatting for the board, so they are testable without
// rendering anything.
import type { TrainState } from "@grugchug/shared";

/** Most focused time first; a tie goes to name so the order does not flicker. */
export function rankTrains(trains: readonly TrainState[]): TrainState[] {
  return [...trains].sort(
    (a, b) =>
      (b.focusedSeconds ?? 0) - (a.focusedSeconds ?? 0) || a.owner.name.localeCompare(b.owner.name),
  );
}

/** `m:ss`, or `h:mm:ss` from the first hour on. */
export function formatFocusTime(seconds: number): string {
  const whole = Math.floor(Math.max(0, seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = String(whole % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
}
