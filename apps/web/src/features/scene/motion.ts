import { ACCEL, BRAKE_DECEL } from "./constants";

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

// Advances one lane by dt seconds. `cruise` is the speed the train would run
// at if it were running; `target` is what the store asks for now (0 when
// stopped). While a stopTarget is set the train keeps cruising and a
// v = sqrt(2 a d) braking curve brings it to rest exactly there.
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
