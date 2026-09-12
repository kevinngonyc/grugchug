// A general Q&A chat with the course TA about the current study material.
// Passes the current station once a session is underway so the answer
// focuses there (before studying starts, every station combined), plus the
// last few answered exchanges so a follow-up question makes sense.
import { MAX_ASK_HISTORY, type PublicRoutePlan } from "@grugchug/shared";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { askConductor, ConductorApiError } from "./api";
import { useMaterialLibrary } from "./material-library";
import type { SessionMode } from "./study-session";
import { useStudySession } from "./study-session";
import { buttonClass, inputClass } from "./ui";

export function askStationId(
  plan: PublicRoutePlan | null,
  stationIndex: number,
  mode: SessionMode,
): string | undefined {
  if (!plan || mode === "idle") return undefined;
  return plan.stations[stationIndex]?.id;
}

type QaEntry = { id: string; question: string; answer: string | null };

type AskPanelProps = { plan: PublicRoutePlan | null };

function useTypewriter(text: string | null, ms = 18): string | null {
  const [n, setN] = useState(0);

  useEffect(() => {
    if (text === null) {
      setN(0);
      return;
    }
    setN(0);
    const id = setInterval(() => {
      setN((i) => {
        if (i >= text.length) {
          clearInterval(id);
          return i;
        }
        return i + 1;
      });
    }, ms);
    return () => clearInterval(id);
  }, [text, ms]);

  if (text === null) return null;
  return text.slice(0, n);
}

function ThinkingDots() {
  return (
    <div
      role="status"
      className="self-start rounded-[1.25rem] rounded-bl-[0.35rem] bg-chat-theirs px-3.5 py-2 text-sm text-chat-theirs-foreground"
    >
      <span className="sr-only">Thinking</span>
      <span className="inline-flex gap-0.5" aria-hidden="true">
        <span className="animate-pulse">·</span>
        <span className="animate-pulse [animation-delay:150ms]">·</span>
        <span className="animate-pulse [animation-delay:300ms]">·</span>
      </span>
    </div>
  );
}

function AnswerBubble({ answer }: { answer: string }) {
  const revealed = useTypewriter(answer);
  return (
    <p className="self-start rounded-[1.25rem] rounded-bl-[0.35rem] bg-chat-theirs px-3.5 py-2 text-sm text-chat-theirs-foreground">
      {revealed}
    </p>
  );
}

export function AskPanel({ plan }: AskPanelProps) {
  const stationIndex = useStudySession((s) => s.stationIndex);
  const mode = useStudySession((s) => s.mode);
  const materialCount = useMaterialLibrary((s) => s.items.length);
  const [entries, setEntries] = useState<QaEntry[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const placeholder = plan
    ? "Ask a question…"
    : materialCount > 0
      ? "Press Study first"
      : "Upload material first";

  const emptyHint = plan
    ? null
    : materialCount > 0
      ? `${materialCount} materials uploaded — press Study to build your route, then ask anything about them here.`
      : "Upload material to start a route, then ask anything about it here.";

  const onAsk = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const trimmed = question.trim();
      if (!trimmed || !plan) return;

      const id = crypto.randomUUID();
      const history = entries
        .flatMap((entry) =>
          entry.answer === null ? [] : [{ question: entry.question, answer: entry.answer }],
        )
        .slice(-MAX_ASK_HISTORY);
      setError(null);
      setAsking(true);
      setQuestion("");
      setEntries((prev) => [...prev, { id, question: trimmed, answer: null }]);
      try {
        const { answer } = await askConductor({
          planId: plan.id,
          question: trimmed,
          stationId: askStationId(plan, stationIndex, mode),
          history,
        });
        setEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, answer } : entry)));
      } catch (err) {
        setEntries((prev) => prev.filter((entry) => entry.id !== id));
        setError(err instanceof ConductorApiError ? err.message : "Something went wrong.");
      } finally {
        setAsking(false);
      }
    },
    [plan, question, stationIndex, mode, entries],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-border/40 px-4 py-3">
        <h2 className="text-sm font-semibold">Ask about this material</h2>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        {emptyHint ? (
          <p className="m-auto max-w-[16rem] text-center text-sm text-muted-foreground">
            {emptyHint}
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
              {entry.answer === null ? <ThinkingDots /> : <AnswerBubble answer={entry.answer} />}
            </div>
          ))
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <form onSubmit={onAsk} className="flex gap-2 border-t border-border/40 p-3">
        <input
          className={inputClass}
          placeholder={placeholder}
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
