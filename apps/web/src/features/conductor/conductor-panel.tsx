// The conductor's main panel: upload material, then work through the route
// it produces — start the timer, arrive at a station, answer or keep
// studying, and repeat. All state lives in study-session.ts; this only
// renders whichever view its current mode calls for.
import type { Answer, PublicQuestion, PublicRoutePlan, PublicStation } from "@grugchug/shared";
import { Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { MaterialDropzone } from "./material-dropzone";
import { useMaterialLibrary } from "./material-library";
import { StationProgress } from "./station-progress";
import { useConductorUi } from "./store";
import { useStudySession } from "./study-session";
import { buttonClass, cardClass, secondaryButtonClass, textareaClass } from "./ui";

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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

export function ConductorPanel() {
  const mode = useStudySession((s) => s.mode);
  const plan = useStudySession((s) => s.plan);
  const close = useConductorUi((s) => s.closePanel);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border/40 px-4 py-3">
        <h2 className="text-sm font-semibold">Conductor</h2>
        <button
          type="button"
          onClick={close}
          aria-label="Close conductor"
          className="rounded-md p-1 text-muted-foreground hover:bg-accent"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
        {mode === "idle" && !plan && <LibraryHome />}
        {mode === "idle" && plan && <RouteSummary plan={plan} />}
        {(mode === "counting" || mode === "on-break") && <TimerView />}
        {mode === "at-station" && plan && <StationArrival plan={plan} />}
        {mode === "answering" && plan && <AnsweringView plan={plan} />}
        {mode === "complete" && <CompleteView />}
      </div>
    </div>
  );
}

// Everything uploaded so far, and one Study button under it: a route covers
// the whole set, so there is nothing to choose between here.
function LibraryHome() {
  const items = useMaterialLibrary((s) => s.items);
  const busy = useStudySession((s) => s.busy);
  const error = useStudySession((s) => s.error);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <MaterialDropzone />

      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className={`${cardClass} flex items-center gap-2 py-2`}>
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</p>
              <button
                type="button"
                className={secondaryButtonClass}
                aria-label={`Remove ${item.name}`}
                onClick={() => useMaterialLibrary.getState().remove(item.id)}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <button
        type="button"
        className={`${buttonClass} mt-auto`}
        disabled={items.length === 0 || busy}
        onClick={() => useStudySession.getState().studyAll()}
      >
        {busy
          ? "Building your route…"
          : items.length === 0
            ? "Study"
            : `Study ${items.length} material${items.length === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}

function RouteSummary({ plan }: { plan: PublicRoutePlan }) {
  const busy = useStudySession((s) => s.busy);
  const error = useStudySession((s) => s.error);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {plan.stations.length} station{plan.stations.length === 1 ? "" : "s"}, about{" "}
        {plan.totalEstimatedMinutes} minutes total.
      </p>
      <ol className="flex flex-col gap-2">
        {plan.stations.map((station, i) => (
          <li key={station.id} className={cardClass}>
            <p className="text-sm font-medium">
              {i + 1}. {station.title}
            </p>
            <p className="text-xs text-muted-foreground">{station.scope}</p>
            <p className="mt-1 text-xs text-muted-foreground">~{station.estimatedMinutes} min</p>
          </li>
        ))}
      </ol>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button
        type="button"
        className={buttonClass}
        disabled={busy}
        onClick={() => useStudySession.getState().startStudying()}
      >
        {busy ? "Starting…" : "Start studying"}
      </button>
      <button
        type="button"
        className={secondaryButtonClass}
        onClick={() => useStudySession.getState().quit()}
      >
        Back to library
      </button>
    </div>
  );
}

function TimerView() {
  const mode = useStudySession((s) => s.mode);
  const plan = useStudySession((s) => s.plan);
  const stationIndex = useStudySession((s) => s.stationIndex);
  const timerEndsAt = useStudySession((s) => s.timerEndsAt);
  const timerMessage = useStudySession((s) => s.timerMessage);
  const remaining = useRemainingSeconds(timerEndsAt);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      {plan ? <StationProgress plan={plan} stationIndex={stationIndex} /> : null}
      <p className="text-3xl font-semibold tabular-nums">
        {remaining !== null ? formatDuration(remaining) : "--:--"}
      </p>
      <p className="text-sm text-muted-foreground">{timerMessage}</p>
      <p className="text-xs text-muted-foreground">
        {mode === "on-break"
          ? "Enjoy the break — the conductor will check back in."
          : "The train will arrive at the next station on its own."}
      </p>
    </div>
  );
}

function StationArrival({ plan }: { plan: PublicRoutePlan }) {
  const stationIndex = useStudySession((s) => s.stationIndex);
  const busy = useStudySession((s) => s.busy);
  const error = useStudySession((s) => s.error);
  const stationFeedback = useStudySession((s) => s.stationFeedback);
  const station = plan.stations[stationIndex];
  if (!station) return null;

  return (
    <div className="flex flex-col gap-3">
      <StationProgress plan={plan} stationIndex={stationIndex} />
      <p className="text-sm font-medium">You've arrived: {station.title}</p>
      {stationFeedback && <p className="text-xs text-muted-foreground">{stationFeedback}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button
        type="button"
        className={buttonClass}
        disabled={busy}
        onClick={() => useStudySession.getState().chooseAnswer()}
      >
        Answer questions
      </button>
      <button
        type="button"
        className={secondaryButtonClass}
        disabled={busy}
        onClick={() => useStudySession.getState().chooseKeepStudying()}
      >
        {busy ? "One moment…" : "Keep studying this station"}
      </button>
    </div>
  );
}

function QuestionField({
  question,
  answer,
  onChange,
}: {
  question: PublicQuestion;
  answer: Answer | undefined;
  onChange: (answer: Answer) => void;
}) {
  if (question.type === "mcq") {
    return (
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">{question.prompt}</legend>
        {question.choices.map((choice, i) => (
          <label key={choice} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={question.id}
              checked={answer?.type === "mcq" && answer.choiceIndex === i}
              onChange={() => onChange({ type: "mcq", choiceIndex: i })}
            />
            {choice}
          </label>
        ))}
      </fieldset>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium" htmlFor={question.id}>
        {question.prompt}
      </label>
      <textarea
        id={question.id}
        className={textareaClass}
        value={answer?.type === "short" ? answer.text : ""}
        onChange={(e) => onChange({ type: "short", text: e.target.value })}
      />
    </div>
  );
}

function AnsweringView({ plan }: { plan: PublicRoutePlan }) {
  const stationIndex = useStudySession((s) => s.stationIndex);
  const answers = useStudySession((s) => s.answers);
  const busy = useStudySession((s) => s.busy);
  const error = useStudySession((s) => s.error);
  const station: PublicStation | undefined = plan.stations[stationIndex];
  if (!station) return null;

  const allAnswered = station.questions.every((q) => answers[q.id] !== undefined);

  return (
    <div className="flex flex-col gap-4">
      <StationProgress plan={plan} stationIndex={stationIndex} />
      <p className="text-sm font-medium">{station.title}</p>
      {station.questions.map((question) => (
        <QuestionField
          key={question.id}
          question={question}
          answer={answers[question.id]}
          onChange={(answer) => useStudySession.getState().setAnswer(question.id, answer)}
        />
      ))}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button
        type="button"
        className={buttonClass}
        disabled={busy || !allAnswered}
        onClick={() => useStudySession.getState().submitAllAndFinish()}
      >
        {busy ? "Checking…" : "Submit answers"}
      </button>
    </div>
  );
}

function CompleteView() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm font-medium">You've finished this material!</p>
      <button
        type="button"
        className={buttonClass}
        onClick={() => useStudySession.getState().quit()}
      >
        Back to library
      </button>
    </div>
  );
}
