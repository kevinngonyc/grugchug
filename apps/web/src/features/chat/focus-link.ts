// One-way pipe for the study score: features/session pushes it in, the live
// socket carries it out to the room. Chat never reaches the other way — it
// does not read gaze, typing or session state, it just transports numbers it
// is handed.
//
// Throttled here rather than at either end, so neither the session's twice-a-
// second tick nor the socket has to know what a sensible send rate is.

/** No more than one frame every this long, however often the score is reported. */
export const FOCUS_MIN_INTERVAL_MS = 2_000;
/** A change smaller than this is not worth a frame. */
export const FOCUS_MIN_DELTA = 0.02;
/**
 * Banked focus time that has moved by this much is worth a frame even at a
 * steady score — otherwise someone studying evenly would never climb the
 * leaderboard on anyone else's screen.
 */
export const FOCUS_SECONDS_MIN_DELTA = 1;

export type FocusReport = { efficiency: number; focusedSeconds: number };

type FocusSink = (report: FocusReport) => void;

let sink: FocusSink | null = null;
let lastSent: FocusReport | null = null;
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
 * Offer the room the current 0..1 study score and today's banked focus time.
 * Cheap to call on every tick: most calls do nothing.
 */
export function reportFocus(
  efficiency: number,
  focusedSeconds: number,
  now: number = Date.now(),
): void {
  if (!sink) return;
  const report: FocusReport = {
    efficiency: Math.min(1, Math.max(0, efficiency)),
    focusedSeconds: Math.max(0, focusedSeconds),
  };
  const changed =
    lastSent === null ||
    Math.abs(report.efficiency - lastSent.efficiency) >= FOCUS_MIN_DELTA ||
    Math.abs(report.focusedSeconds - lastSent.focusedSeconds) >= FOCUS_SECONDS_MIN_DELTA;
  if (!changed) return;
  if (lastSent !== null && now - lastSentAt < FOCUS_MIN_INTERVAL_MS) return;

  lastSent = report;
  lastSentAt = now;
  sink(report);
}
