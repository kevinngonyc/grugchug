// The conductor's study-plan panel: upload material, see the route it
// produces. Stage C wires an actual start/timer/station flow onto this
// route — for now this only proves the upload round-trip. Plan state lives
// in ConductorOverlay (the parent), not here, because the ask panel next to
// this one needs it too.
import type { PublicRoutePlan } from "@grugchug/shared";
import { X } from "lucide-react";
import { type FormEvent, useCallback, useState } from "react";
import { getUserId } from "@/lib/user-id";
import { ConductorApiError, createPlan } from "./api";
import {
  buttonClass,
  cardClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
  textareaClass,
} from "./ui";

type ConductorPanelProps = {
  plan: PublicRoutePlan | null;
  onPlanCreated: (plan: PublicRoutePlan) => void;
  onStartOver: () => void;
  onClose: () => void;
};

// data:<mime>;base64,<payload> — the API wants only the payload.
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("could not read file"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("could not read file"));
    reader.readAsDataURL(file);
  });
}

export function ConductorPanel({ plan, onPlanCreated, onStartOver, onClose }: ConductorPanelProps) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [availableMinutes, setAvailableMinutes] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!file && text.trim().length === 0) {
        setError("Paste some material, or choose a PDF.");
        return;
      }

      setSubmitting(true);
      try {
        const material = file
          ? ({ kind: "pdf", base64: await readFileAsBase64(file) } as const)
          : ({ kind: "text", text } as const);
        const result = await createPlan({ userId: getUserId(), availableMinutes, material });
        onPlanCreated(result);
      } catch (err) {
        setError(err instanceof ConductorApiError ? err.message : "Something went wrong.");
      } finally {
        setSubmitting(false);
      }
    },
    [file, text, availableMinutes, onPlanCreated],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border/40 px-4 py-3">
        <h2 className="text-sm font-semibold">Conductor</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close conductor"
          className="rounded-md p-1 text-muted-foreground hover:bg-accent"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
        {plan ? (
          <RouteSummary plan={plan} onStartOver={onStartOver} />
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="conductor-material">
                Study material
              </label>
              <textarea
                id="conductor-material"
                className={textareaClass}
                placeholder="Paste your notes here…"
                value={text}
                disabled={file !== null}
                onChange={(e) => setText(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="conductor-file">
                Or upload a PDF
              </label>
              <input
                id="conductor-file"
                type="file"
                accept="application/pdf"
                className={inputClass}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="conductor-minutes">
                Minutes available
              </label>
              <input
                id="conductor-minutes"
                type="number"
                min={1}
                max={600}
                className={inputClass}
                value={availableMinutes}
                onChange={(e) => setAvailableMinutes(Number(e.target.value))}
              />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <button type="submit" className={buttonClass} disabled={submitting}>
              {submitting ? "Building your route…" : "Start studying"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function RouteSummary({ plan, onStartOver }: { plan: PublicRoutePlan; onStartOver: () => void }) {
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
      <button type="button" className={secondaryButtonClass} onClick={onStartOver}>
        Upload different material
      </button>
    </div>
  );
}
