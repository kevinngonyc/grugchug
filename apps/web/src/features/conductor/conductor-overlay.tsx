// The conductor's whole visible surface during a session. Unlike chat,
// there is no button of its own: clicking the conductor character in the 3D
// scene (features/scene's train.tsx) is the only way in, and this component
// reacts to that same open/closed state the scene's camera rig eases toward.
//
// Three pieces once open: a general Q&A panel on the left (features/scene
// keeps the conductor sprite visible in the gap between the two), the
// study-plan / station panel on the right, and a small break/quit control
// strip below it. The study session's state (plan, timer, station, answers)
// lives in study-session.ts, not here — this just hydrates it once and runs
// its one-second tick.
import { useEffect } from "react";
import { AskPanel } from "./ask-panel";
import { ConductorPanel } from "./conductor-panel";
import { SessionControls } from "./session-controls";
import { useConductorUi } from "./store";
import { useStudyDrive } from "./study-drive";
import { useStudySession } from "./study-session";

const panelCardClass =
  "overflow-hidden rounded-2xl border border-border/40 bg-background/55 shadow-xl backdrop-blur-md";

export function ConductorOverlay() {
  const open = useConductorUi((s) => s.open);
  const plan = useStudySession((s) => s.plan);

  useStudyDrive();

  useEffect(() => {
    void useStudySession.getState().hydrate();
  }, []);

  useEffect(() => {
    const id = setInterval(() => useStudySession.getState().tick(), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div
        aria-hidden={!open}
        className={
          `absolute inset-y-4 left-4 z-10 ${open ? "flex" : "hidden"} ` +
          `w-[min(26rem,calc(45%-2rem))] flex-col ${panelCardClass}`
        }
      >
        <AskPanel plan={plan} />
      </div>

      <div
        aria-hidden={!open}
        className={`absolute inset-y-4 right-4 z-10 ${open ? "flex" : "hidden"} w-[min(30rem,calc(45%-2rem))] flex-col gap-2`}
      >
        <div className={`flex min-h-0 flex-1 flex-col ${panelCardClass}`}>
          <ConductorPanel />
        </div>
        <SessionControls />
      </div>
    </>
  );
}
