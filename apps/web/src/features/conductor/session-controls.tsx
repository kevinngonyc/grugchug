// Bottom-right controls, below the study-plan panel: break or quit. A break
// can be taken mid-stretch (the study timer pauses and resumes after it) or
// at a station; quit is always available. Both proxy to study-session.ts,
// which owns the real state. Two plain, equal-width buttons — no shared
// card — so each reads as its own control; quit is destructive red, break
// keeps its ordinary styling since it isn't.
import { useStudySession } from "./study-session";
import { destructiveButtonClass, secondaryButtonClass } from "./ui";

export function SessionControls() {
  const mode = useStudySession((s) => s.mode);
  const busy = useStudySession((s) => s.busy);
  const plan = useStudySession((s) => s.plan);

  const canBreak = plan !== null && (mode === "counting" || mode === "at-station");

  return (
    <div className="flex shrink-0 gap-3">
      <button
        type="button"
        className={`${secondaryButtonClass} flex-1 py-3`}
        disabled={!canBreak || busy}
        onClick={() => useStudySession.getState().chooseBreak()}
      >
        Take a break
      </button>
      <button
        type="button"
        className={`${destructiveButtonClass} flex-1 py-3`}
        disabled={plan === null}
        onClick={() => useStudySession.getState().quit()}
      >
        Quit session
      </button>
    </div>
  );
}
