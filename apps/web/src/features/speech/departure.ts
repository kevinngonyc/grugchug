import type { TrainPhase } from "@grugchug/shared";
import { useWorld } from "@/features/world";
import type { VoiceLineId } from "./lines";
import { sayLine } from "./say-line";

export type DepartureAnnouncer = { start(): void; stop(): void };

// Which line a change of the local train's phase calls for. `undefined` is
// "no local train yet", so its first appearance running is the session start.
function lineFor(from: TrainPhase | undefined, to: TrainPhase | undefined): VoiceLineId | null {
  if (from === to) return null;
  if (to === "running") return from === undefined ? "startSession" : "restartStudy";
  if (to === "stopped") return from === undefined ? null : "takeBreak";
  if (to === "finished") return from === undefined ? null : "greatSession";
  return null;
}

// Voices the local train's journey: the start-of-session line when it first
// appears running, the break line when it stops, the restart line when it
// pulls out again, and the great-session line when it finishes. Whatever
// state exists when the announcer starts is not announced, so coming back to
// the session page does not replay a line. A driver like the player: it
// reaches the world only through `say` (via `sayLine`).
export function createDepartureAnnouncer(): DepartureAnnouncer {
  let unsubscribe: (() => void) | null = null;
  let lastPhase: TrainPhase | undefined;

  const localTrain = () => {
    const { localTrainId, trains } = useWorld.getState();
    return {
      id: localTrainId,
      phase: localTrainId === null ? undefined : trains[localTrainId]?.phase,
    };
  };

  const sync = () => {
    const { id, phase } = localTrain();
    const lineId = id === null ? null : lineFor(lastPhase, phase);
    // Record before saying: `say` writes the store, which re-enters this
    // listener synchronously, and it must see the phase as already handled.
    lastPhase = phase;
    if (lineId !== null) sayLine(lineId);
  };

  return {
    start() {
      if (unsubscribe) return;
      lastPhase = localTrain().phase;
      unsubscribe = useWorld.subscribe(sync);
    },
    stop() {
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}
