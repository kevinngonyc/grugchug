// A general Q&A chat about the current study material — reuses
// ask-conductor with no stationId, which makes the server fall back to
// every station's scope combined, so this answers anything in the plan, not
// just the current station.
import type { PublicRoutePlan } from "@grugchug/shared";
import { type FormEvent, useCallback, useState } from "react";
import { askConductor, ConductorApiError } from "./api";
import { buttonClass, inputClass } from "./ui";

type QaEntry = { id: string; question: string; answer: string };

type AskPanelProps = { plan: PublicRoutePlan | null };

export function AskPanel({ plan }: AskPanelProps) {
  const [entries, setEntries] = useState<QaEntry[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const onAsk = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const trimmed = question.trim();
      if (!trimmed || !plan) return;

      setError(null);
      setAsking(true);
      setQuestion("");
      try {
        const { answer } = await askConductor({ planId: plan.id, question: trimmed });
        setEntries((prev) => [...prev, { id: crypto.randomUUID(), question: trimmed, answer }]);
      } catch (err) {
        setError(err instanceof ConductorApiError ? err.message : "Something went wrong.");
      } finally {
        setAsking(false);
      }
    },
    [plan, question],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-border/40 px-4 py-3">
        <h2 className="text-sm font-semibold">Ask about this material</h2>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        {!plan ? (
          <p className="m-auto max-w-[16rem] text-center text-sm text-muted-foreground">
            Upload material to start a route, then ask anything about it here.
          </p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ask anything about what you're studying — the conductor answers using this plan.
          </p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-1">
              <p className="self-end rounded-[1.25rem] rounded-br-[0.35rem] bg-chat-mine px-3.5 py-2 text-sm text-chat-mine-foreground">
                {entry.question}
              </p>
              <p className="self-start rounded-[1.25rem] rounded-bl-[0.35rem] bg-chat-theirs px-3.5 py-2 text-sm text-chat-theirs-foreground">
                {entry.answer}
              </p>
            </div>
          ))
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <form onSubmit={onAsk} className="flex gap-2 border-t border-border/40 p-3">
        <input
          className={inputClass}
          placeholder={plan ? "Ask a question…" : "Upload material first"}
          value={question}
          disabled={!plan || asking}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button
          type="submit"
          className={buttonClass}
          disabled={!plan || asking || question.trim().length === 0}
        >
          Ask
        </button>
      </form>
    </div>
  );
}
