// Owns the score subscription so Session (and the Canvas under it) does not
// re-render every efficiency tick.
import { reportAttention, useEfficiency } from "@/features/efficiency";
import { Gaze } from "@/features/gaze";
import { SpeedRing } from "./speed-ring";

type FocusHudProps = { debug: boolean };

export function FocusHud({ debug }: FocusHudProps) {
  const score = useEfficiency((s) => s.score);

  return (
    <div className="absolute bottom-4 left-4 z-10 rounded-lg bg-white/90 font-mono">
      <SpeedRing fraction={score / 100} />
      <div className="px-4 pt-3 text-sm font-semibold">Focus {Math.round(score)}/100</div>
      <Gaze debug={debug} onFacing={reportAttention} />
    </div>
  );
}
