import { useSyncExternalStore } from "react";
import { FACE_FRAMES, FACE_LABELS } from "./face-model";
import { getPrediction, subscribePrediction } from "./face-tracker";

export function FacePrediction() {
  const state = useSyncExternalStore(subscribePrediction, getPrediction);
  return (
    <div className="mt-3 max-w-72 border-t pt-3 text-xs">
      <div className="font-semibold">Face prediction</div>
      {state.status === "loading" && <p>Loading face model…</p>}
      {state.status === "collecting" && (
        <p>
          Reading face… {state.frames}/{FACE_FRAMES} samples
        </p>
      )}
      {state.status === "no-face" && <p>No face detected</p>}
      {state.status === "paused" && <p>Paused while tab is hidden</p>}
      {state.status === "error" && (
        <p role="alert" className="break-words text-red-700">
          Prediction unavailable: {state.message}
        </p>
      )}
      {state.status === "ready" && (
        <>
          <p className="mt-1">
            Prediction: <strong>{state.label}</strong>
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
            {FACE_LABELS.map((label, i) => (
              <div key={label} className="contents">
                <dt>{label}</dt>
                <dd className="text-right">{state.scores[i]?.toFixed(3)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-muted-foreground">Experimental model scores</p>
          {state.diagnostics && (
            <div className="mt-2 text-muted-foreground tabular-nums">
              <p>
                Prediction #{state.diagnostics.predictionId} · Frame {state.diagnostics.frameId}
              </p>
              <p>{state.diagnostics.inferenceMs.toFixed(0)} ms per prediction</p>
              <p title="RMS difference between the landmark coordinates sent to the last two predictions">
                Input change:{" "}
                {state.diagnostics.inputChange === null
                  ? "—"
                  : state.diagnostics.inputChange.toExponential(2)}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
