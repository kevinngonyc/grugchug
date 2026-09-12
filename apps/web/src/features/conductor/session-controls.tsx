// Bottom-right controls, below the study-plan panel: break or quit. Break is
// only offered once the train is actually stopped at a station, matching
// the flow the user described; quit is always available. Both proxy to
// study-session.ts, which owns the real state.
import { useStudySession } from "./study-session";
import { secondaryButtonClass } from "./ui";

export function SessionControls() {
  const mode = useStudySession((s) => s.mode);
  const busy = useStudySession((s) => s.busy);
  const plan = useStudySession((s) => s.plan);

  const canBreak = plan !== null && mode === "at-station";

  return (
    <div className="flex shrink-0 gap-2 rounded-2xl border border-border/40 bg-background/55 p-3 shadow-xl backdrop-blur-md">
      <button
        type="button"
        className={secondaryButtonClass}
        disabled={!canBreak || busy}
        onClick={() => useStudySession.getState().chooseBreak()}
      >
        Take a break
      </button>
      <button
        type="button"
        className={secondaryButtonClass}
        disabled={plan === null}
        onClick={() => useStudySession.getState().quit()}
      >
        Quit session
      </button>
    </div>
  );
}
