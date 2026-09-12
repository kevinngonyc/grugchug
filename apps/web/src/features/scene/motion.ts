import {
  ACCEL,
  BRAKE_DECEL,
  DRIFT_CLOSE_MAX_SPEED,
  DRIFT_CLOSE_RATE,
  DRIFT_CLOSE_TOLERANCE,
} from "./constants";

// Per-frame state for one lane. Lives in a ref, mutated inside useFrame, never
// in React state, so a running world costs zero re-renders.
export type LaneMotion = {
  scroll: number; // metres travelled
  speed: number; // metres per second, eased
  stopTarget: number | null; // scroll value at which the train must rest
};

export function createMotion(): LaneMotion {
  return { scroll: 0, speed: 0, stopTarget: null };
}

export function stepMotion(m: LaneMotion, cruise: number, target: number, dt: number): void {
  const wanted = m.stopTarget === null ? target : cruise;
  let v = m.speed;
  if (v < wanted) v = Math.min(wanted, v + ACCEL * dt);
  else if (v > wanted) v = Math.max(wanted, v - BRAKE_DECEL * dt);

  if (m.stopTarget !== null) {
    const remaining = m.stopTarget - m.scroll;
    v = remaining <= 0 ? 0 : Math.min(v, Math.sqrt(2 * BRAKE_DECEL * remaining));
  }

  m.scroll += v * dt;
  if (m.stopTarget !== null && m.scroll >= m.stopTarget) {
    m.scroll = m.stopTarget;
    v = 0;
  }
  m.speed = v;
}

/**
 * How far ahead (positive) or behind a companion train has got, in metres.
 * Both sides integrate their own speed, so the difference in their scroll is
 * the gap along the track — the same world, different places in it.
 *
 * Unbounded on purpose. Someone who studies harder than you for ten minutes
 * really is a long way up the line, and pretending otherwise would mean
 * holding them at the edge and then owing them the distance back.
 */
export function driftGap(m: LaneMotion, leaderScroll: number): number {
  return m.scroll - leaderScroll;
}

/**
 * How much of a gap to give back this step, signed the same way as `gap`.
 *
 * The gap is only meaningful while the two trains disagree about speed, so
 * the easing fades in as they converge and is off entirely past
 * DRIFT_CLOSE_TOLERANCE. Proportional, but capped: a train a hundred metres
 * out comes back at a steady walk rather than snapping into frame, and the
 * last few metres ease shut. Never overshoots.
 */
export function driftClosing(gap: number, speedMismatch: number, dt: number): number {
  const agreement = 1 - Math.min(1, Math.abs(speedMismatch) / DRIFT_CLOSE_TOLERANCE);
  if (agreement <= 0 || gap === 0) return 0;

  const rate = Math.min(Math.abs(gap) * DRIFT_CLOSE_RATE, DRIFT_CLOSE_MAX_SPEED);
  const step = Math.min(rate * agreement * dt, Math.abs(gap));
  return Math.sign(gap) * step;
}

// Scrolling strips place items by world x and draw them at worldX - scroll.
// Once an item falls below `cutoff` on screen it jumps forward by `span`, so a
// fixed pool covers the visible width forever. Returns the new world x.
export function wrapWorldX(worldX: number, scroll: number, cutoff: number, span: number): number {
  let x = worldX;
  while (x - scroll < cutoff) x += span;
  return x;
}

// Lets shared elements (the far hills) read the local train's motion without
// prop drilling through the Canvas.
const registry = new Map<string, LaneMotion>();

export function registerMotion(id: string, motion: LaneMotion): void {
  registry.set(id, motion);
}

export function unregisterMotion(id: string): void {
  registry.delete(id);
}

export function getMotion(id: string): LaneMotion | undefined {
  return registry.get(id);
}
