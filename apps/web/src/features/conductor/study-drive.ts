import type { Journey, TrainPhase } from "@grugchug/shared";
import { useEffect } from "react";
import { useWorld } from "@/features/world";
import { type SessionMode, useStudySession } from "./study-session";

// The study session is the source of truth for the local train: only a running
// timer moves it, completing the route is the terminus, and everything else is
// time at a platform (including no session at all).
export function phaseForMode(mode: SessionMode): TrainPhase {
  if (mode === "counting") return "running";
  if (mode === "complete") return "finished";
  return "stopped";
}

// Where this rider is, as the room should see it.
export function journeyForSession(s: {
  mode: SessionMode;
  stationIndex: number;
  plan: { stations: readonly unknown[] } | null;
}): Journey {
  const station = s.plan ? { index: s.stationIndex + 1, total: s.plan.stations.length } : null;
  switch (s.mode) {
    case "idle":
      return { state: "idle", station };
    case "counting":
      return { state: "studying", station };
    case "at-station":
      return { state: "at-station", station };
    case "answering":
      return { state: "answering", station };
    case "on-break":
      return { state: "on-break", station };
    case "complete":
      return { state: "finished", station };
  }
}

// One place writes the local train's phase. Idempotent, so it can run on every
// mode change and whenever the local train (re)appears.
export function applyStudyPhase(): void {
  const { mode } = useStudySession.getState();
  const { localTrainId, trains, setPhase } = useWorld.getState();
  if (localTrainId === null) return;
  const phase = phaseForMode(mode);
  if (trains[localTrainId]?.phase !== phase) setPhase(localTrainId, phase);
}

export function useStudyDrive(): void {
  useEffect(() => {
    applyStudyPhase();
    const unsubscribeStudy = useStudySession.subscribe((s, prev) => {
      if (s.mode !== prev.mode) applyStudyPhase();
    });
    const unsubscribeWorld = useWorld.subscribe((s, prev) => {
      if (s.localTrainId !== prev.localTrainId) applyStudyPhase();
    });
    return () => {
      unsubscribeStudy();
      unsubscribeWorld();
    };
  }, []);
}
