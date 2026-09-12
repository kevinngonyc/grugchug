// The conductor's whole visible surface during a session. Unlike chat,
// there is no button of its own: clicking the conductor character in the 3D
// scene (features/scene's train.tsx) is the only way in, and this component
// reacts to that same open/closed state the scene's camera rig eases toward.
//
// Three pieces once open: a general Q&A panel on the left (features/scene
// keeps the conductor sprite visible in the gap between the two), the
// study-plan panel on the right, and a small break/quit control strip below
// it. plan lives here, not in ConductorPanel, because the ask panel needs it
// too — Stage C will likely absorb this into a fuller session hook.
import type { PublicRoutePlan } from "@grugchug/shared";
import { useState } from "react";
import { AskPanel } from "./ask-panel";
import { ConductorPanel } from "./conductor-panel";
import { SessionControls } from "./session-controls";
import { useConductorUi } from "./store";

const panelCardClass =
  "overflow-hidden rounded-2xl border border-border/40 bg-background/55 shadow-xl backdrop-blur-md";

export function ConductorOverlay() {
  const open = useConductorUi((s) => s.open);
  const close = useConductorUi((s) => s.closePanel);
  const [plan, setPlan] = useState<PublicRoutePlan | null>(null);

  const onQuit = () => {
    setPlan(null);
    close();
  };

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
          <ConductorPanel
            plan={plan}
            onPlanCreated={setPlan}
            onStartOver={() => setPlan(null)}
            onClose={close}
          />
        </div>
        <SessionControls plan={plan} onQuit={onQuit} />
      </div>
    </>
  );
}
