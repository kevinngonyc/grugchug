import type { StudySessionSummary } from "@grugchug/shared";
import { useEffect, useState } from "react";
import { getUserId } from "@/lib/user-id";
import { fetchHistory } from "./history";

type Props = { load?: () => Promise<StudySessionSummary[]> };

function minutesBetween(a: string, b: string | null): number | null {
  if (!b) return null;
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));
}

// Your recent runs through a route, newest first. `load` is injectable for tests.
export function SessionHistory({ load = () => fetchHistory(getUserId()) }: Props) {
  const [sessions, setSessions] = useState<StudySessionSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((list) => {
        if (!cancelled) setSessions(list);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (failed) return <p className="text-sm text-destructive">History is unavailable right now.</p>;
  if (sessions === null) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No sessions yet. Open the conductor in a session to start one.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {sessions.map((s) => {
        const minutes = minutesBetween(s.startedAt, s.endedAt);
        return (
          <li
            key={s.id}
            className="flex flex-wrap items-baseline gap-x-3 rounded-lg border p-3 text-sm"
          >
            <span className="font-medium">{new Date(s.startedAt).toLocaleString()}</span>
            <span>
              {s.stationsPassed} of {s.stationTotal} stations
            </span>
            <span className="text-muted-foreground">
              {minutes === null ? "in progress" : `${minutes} min`}
            </span>
            <span className="text-muted-foreground">{s.outcome ?? ""}</span>
          </li>
        );
      })}
    </ul>
  );
}
