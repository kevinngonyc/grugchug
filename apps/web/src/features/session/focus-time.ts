// Your focused time banked today — what the leaderboard ranks by. For now it
// is the score integrated over time: every second on the session page adds
// score/100 seconds, so a half-focused minute banks thirty seconds. A
// placeholder measure; a weighted blend with quiz results is planned.
//
// Kept per calendar day in localStorage, so a reload does not reset where you
// stand. Guarded storage access, same pattern as features/chat/storage.ts.

const STORAGE_KEY = "grugchug.focus.today";

/**
 * A gap between ticks longer than this — a sleeping tab, a paused debugger —
 * counts as this much. Time nobody was measuring cannot be focused time.
 */
export const MAX_FOCUS_STEP_MS = 2_000;

/** Focused seconds earned over `dtMs` at a 0..1 `fraction` of full focus. */
export function focusStep(fraction: number, dtMs: number): number {
  if (!(dtMs > 0)) return 0;
  const clamped = Math.min(1, Math.max(0, fraction));
  return (Math.min(dtMs, MAX_FOCUS_STEP_MS) / 1000) * clamped;
}

/** The local calendar day `at` falls on, as a storage key. */
export function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStored(day: string): number {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { day?: unknown; seconds?: unknown };
    const seconds = parsed.seconds;
    return parsed.day === day && typeof seconds === "number" && seconds >= 0 ? seconds : 0;
  } catch {
    return 0;
  }
}

function writeStored(day: string, seconds: number): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify({ day, seconds }));
  } catch {
    // Out of quota or blocked: the total still counts for this page view.
  }
}

let today: { day: string; seconds: number; lastAt: number | null } | null = null;

/**
 * Bank the time since the last call at `fraction` focus and return today's
 * total. The first call of a day (or of a page view) only starts the clock.
 */
export function accumulateFocus(fraction: number, at: number): number {
  const day = dayKey(at);
  if (!today || today.day !== day) today = { day, seconds: readStored(day), lastAt: null };
  if (today.lastAt !== null) today.seconds += focusStep(fraction, at - today.lastAt);
  today.lastAt = at;
  writeStored(day, today.seconds);
  return today.seconds;
}

/** Forget the in-memory clock, as a reload would. Tests use it. */
export function resetFocusClock(): void {
  today = null;
}
