// The world calling everything to a standstill. Subscribed rather than
// selected: an arrival is rare and a re-render is not free in a scene that is
// already drawing sixty times a second, and what a regroup changes are refs
// that React does not need to know about.
import { useEffect } from "react";
import { useWorld } from "@/features/world";

/**
 * Runs `onRegroup` each time `regroup()` is called. Pass a stable callback —
 * a changing one re-subscribes.
 */
export function useRegroup(onRegroup: () => void): void {
  useEffect(
    () =>
      useWorld.subscribe((state, previous) => {
        if (state.regroups !== previous.regroups) onRegroup();
      }),
    [onRegroup],
  );
}
