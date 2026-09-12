// The one place the study score meets the world: the local train's efficiency
// is the current score as a 0..1 fraction, and the scene turns that into speed
// (`features/world/speed.ts`, MIN_SPEED..MAX_SPEED). Focus 0 crawls, focus 100
// runs flat out; a running train never stops for a rough stretch.
//
// The same tick recomputes the score itself, which is what makes an ageing
// signal — a quiz answered ten minutes ago — wear off on its own rather than
// waiting for someone to report again.
import { useEffect } from "react";
import { reportFocus } from "@/features/chat";
import { efficiencyFraction, useEfficiency } from "@/features/efficiency";
import { useWorld } from "@/features/world";

export const EFFICIENCY_DRIVE_INTERVAL_MS = 500;

/**
 * One pass: age the signals, then hand the score to the local train — and to
 * the room, so the people you invited see your train run at the speed you are
 * actually studying at. Chat throttles the sending; this just offers it.
 */
export function driveEfficiencyOnce(at: number = Date.now()): void {
  useEfficiency.getState().tick(at);

  const fraction = efficiencyFraction();
  reportFocus(fraction, at);

  const { localTrainId, setEfficiency } = useWorld.getState();
  if (localTrainId === null) return;
  setEfficiency(localTrainId, fraction);
}

export function useEfficiencyDrive(intervalMs: number = EFFICIENCY_DRIVE_INTERVAL_MS): void {
  useEffect(() => {
    const timer = setInterval(() => driveEfficiencyOnce(), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
}
