// Owns the score subscription so Session (and the Canvas under it) does not
// re-render every efficiency tick.
import { reportAttention, useEfficiency } from "@/features/efficiency";
import { Gaze } from "@/features/gaze";
import { SpeedRing } from "./speed-ring";

type FocusHudProps = {
  debug: boolean;
  /**
   * `/session?nogaze` turns the webcam tracker off. It is a measuring stick,
   * not a feature: head tracking runs a face-mesh model on the main thread,
   * which is the one cost in this app that competes with the render loop
   * frame for frame. If the scene is smooth with this off and stuttery with
   * it on, the tracker is the thing to tune, not the scene.
   */
  gaze?: boolean;
};

export function FocusHud({ debug, gaze = true }: FocusHudProps) {
  const score = useEfficiency((s) => s.score);

  return (
    <div className="absolute bottom-4 left-4 z-10 rounded-lg bg-white/90 font-mono">
      <SpeedRing fraction={score / 100} />
      <div className="px-4 pt-3 text-sm font-semibold">Focus {Math.round(score)}/100</div>
      {gaze ? (
        <Gaze debug={debug} onFacing={reportAttention} />
      ) : (
        <div className="px-4 pt-3 pb-3 text-xs text-muted-foreground">
          Head tracking off (?nogaze)
        </div>
      )}
    </div>
  );
}
