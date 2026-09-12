// Bottom-right controls, below the study-plan panel: break or quit. A break
// can be taken mid-stretch (the study timer pauses and resumes after it) or
// at a station; while one is running the same button ends it early, since a
// break nobody can leave is a trap. Quit is always available. All proxy to
// study-session.ts, which owns the real state. Two plain, equal-width
// buttons — no shared card — so each reads as its own control; quit is
// destructive red, break keeps its ordinary styling since it isn't.
import { useStudySession } from "./study-session";
import { destructiveButtonClass, secondaryButtonClass } from "./ui";

export function SessionControls() {
  const mode = useStudySession((s) => s.mode);
  const busy = useStudySession((s) => s.busy);
  const plan = useStudySession((s) => s.plan);

  const onBreak = mode === "on-break";
  const canBreak = plan !== null && (mode === "counting" || mode === "at-station");

  return (
    <div className="flex shrink-0 gap-3">
      <button
        type="button"
        className={`${secondaryButtonClass} flex-1 py-3`}
        disabled={busy || !(onBreak || canBreak)}
        onClick={() =>
          onBreak ? useStudySession.getState().endBreak() : useStudySession.getState().chooseBreak()
        }
      >
        {onBreak ? "Resume studying" : "Take a break"}
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
