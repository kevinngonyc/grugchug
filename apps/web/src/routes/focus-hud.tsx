// Owns the score subscription so Session (and the Canvas under it) does not
// re-render every efficiency tick.
import { useState } from "react";
import { reportAttention, useEfficiency } from "@/features/efficiency";
import { Gaze } from "@/features/gaze";
import { SpeedRing } from "./speed-ring";

type FocusHudProps = { debug: boolean };

export function FocusHud({ debug }: FocusHudProps) {
  const score = useEfficiency((s) => s.score);
  // Facing the screen or not, at a glance, without reading the text below.
  const [lookingAway, setLookingAway] = useState(false);

  return (
    <div
      className={`absolute bottom-4 left-4 z-10 rounded-lg border-2 bg-white/90 font-mono transition-colors ${
        lookingAway ? "border-red-500" : "border-green-500"
      }`}
    >
      <SpeedRing fraction={score / 100} />
      <div className="px-4 pt-3 text-sm font-semibold">Focus {Math.round(score)}/100</div>
      <Gaze debug={debug} onFacing={reportAttention} onLookingAwayChange={setLookingAway} />
    </div>
  );
}
