// Bottom-right controls, below the study-plan panel: break or quit. This is
// a real call to set-timer for the break (the LLM genuinely decides the
// length), not a placeholder — the countdown/enforcement that actually acts
// on the suggestion is Stage C. Quit just clears the local plan and closes
// the panel; there is no server-side session to end yet.
import type { PublicRoutePlan } from "@grugchug/shared";
import { useCallback, useState } from "react";
import { ConductorApiError, setTimer } from "./api";
import { secondaryButtonClass } from "./ui";

type SessionControlsProps = {
  plan: PublicRoutePlan | null;
  onQuit: () => void;
};

export function SessionControls({ plan, onQuit }: SessionControlsProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onBreak = useCallback(async () => {
    if (!plan) return;
    setPending(true);
    setStatus(null);
    try {
      const { minutes, message } = await setTimer({ planId: plan.id, reason: "break" });
      setStatus(`${message} (~${minutes} min)`);
    } catch (err) {
      setStatus(err instanceof ConductorApiError ? err.message : "Could not start a break.");
    } finally {
      setPending(false);
    }
  }, [plan]);

  return (
    <div className="flex shrink-0 flex-col gap-2 rounded-2xl border border-border/40 bg-background/55 p-3 shadow-xl backdrop-blur-md">
      {status && <p className="text-xs text-muted-foreground">{status}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={onBreak}
          disabled={!plan || pending}
        >
          Take a break
        </button>
        <button type="button" className={secondaryButtonClass} onClick={onQuit}>
          Quit session
        </button>
      </div>
    </div>
  );
}
