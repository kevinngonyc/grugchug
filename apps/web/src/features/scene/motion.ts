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
