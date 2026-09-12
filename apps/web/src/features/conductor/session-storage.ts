// localStorage for the study session, guarded the same way as
// features/chat/storage.ts — a failure here just means "nothing stored",
// never a thrown error. Only enough to resume is kept: the plan itself is
// refetched by id, not persisted, so a stale copy can never be shown.
import type { SessionMode } from "./study-session";

const STORAGE_KEY = "grugchug.conductor.session";

export interface PersistedSession {
  planId: string;
  stationIndex: number;
  mode: SessionMode;
  timerEndsAt: number | null;
  timerMessage: string | null;
  lastStretchMinutes: number | null;
  historyId: string | null;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readSession(): PersistedSession | null {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as PersistedSession).planId === "string" &&
      typeof (parsed as PersistedSession).stationIndex === "number" &&
      typeof (parsed as PersistedSession).mode === "string"
    ) {
      const session = parsed as PersistedSession;
      return { ...session, historyId: session.historyId ?? null };
    }
  } catch {
    // Corrupt entry: behave like there is nothing to resume.
  }
  return null;
}

export function writeSession(session: PersistedSession): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Out of quota or blocked: the session still works for this page view.
  }
}

export function clearSession(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}
