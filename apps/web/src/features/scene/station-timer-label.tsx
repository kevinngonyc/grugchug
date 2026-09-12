import { Html } from "@react-three/drei";
import { useEffect, useState } from "react";
import { useStudySession } from "@/features/conductor";
import { BUBBLE_DISTANCE_FACTOR, TIMER_LABEL_OFFSET } from "./constants";

export function formatStationTimer(
  remainingSeconds: number,
  stationIndex: number,
  stationCount: number,
): string {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")} · ${stationIndex + 1}/${stationCount}`;
}

function useRemainingSeconds(endsAt: number | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (endsAt === null) {
      setRemaining(null);
      return;
    }
    const update = () => setRemaining(Math.max(0, Math.round((endsAt - Date.now()) / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  return remaining;
}

export function StationTimerLabel() {
  const mode = useStudySession((s) => s.mode);
  const endsAt = useStudySession((s) => s.timerEndsAt);
  const stationIndex = useStudySession((s) => s.stationIndex);
  const stationCount = useStudySession((s) => s.plan?.stations.length ?? 0);
  const remaining = useRemainingSeconds(endsAt);

  if (mode !== "counting" && mode !== "on-break") return null;
  if (remaining === null || stationCount === 0) return null;

  return (
    <Html
      position={TIMER_LABEL_OFFSET}
      center
      distanceFactor={BUBBLE_DISTANCE_FACTOR}
      zIndexRange={[10, 0]}
      pointerEvents="none"
    >
      <div className="w-max rounded-full border bg-background/90 px-2 py-0.5 font-mono text-xs tabular-nums text-foreground shadow">
        {formatStationTimer(remaining, stationIndex, stationCount)}
      </div>
    </Html>
  );
}
