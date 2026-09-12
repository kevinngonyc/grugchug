// One-way pipe for the study score: features/session pushes it in, the live
// socket carries it out to the room. Chat never reaches the other way — it
// does not read gaze, typing or session state, it just transports a number it
// is handed.
//
// Throttled here rather than at either end, so neither the session's twice-a-
// second tick nor the socket has to know what a sensible send rate is.

/** No more than one frame every this long, however often the score is reported. */
export const FOCUS_MIN_INTERVAL_MS = 2_000;
/** A change smaller than this is not worth a frame. */
export const FOCUS_MIN_DELTA = 0.02;

type FocusSink = (efficiency: number) => void;

let sink: FocusSink | null = null;
let lastSent: number | null = null;
let lastSentAt = 0;

/** The open socket registers itself here; passing null on disconnect. */
export function setFocusSink(next: FocusSink | null): void {
  sink = next;
  // A fresh connection has told the room nothing yet, so the next report goes
  // out whatever it says.
  lastSent = null;
  lastSentAt = 0;
}

/**
 * Offer the room the current 0..1 study score. Cheap to call on every tick:
 * most calls do nothing.
 */
export function reportFocus(efficiency: number, now: number = Date.now()): void {
  if (!sink) return;
  const value = Math.min(1, Math.max(0, efficiency));
  const changed = lastSent === null || Math.abs(value - lastSent) >= FOCUS_MIN_DELTA;
  if (!changed) return;
  if (lastSent !== null && now - lastSentAt < FOCUS_MIN_INTERVAL_MS) return;

  lastSent = value;
  lastSentAt = now;
  sink(value);
}
