import type { TrainPhase } from "@grugchug/shared";
import { useWorld } from "@/features/world";
import { VOICE_LINES } from "./lines";

export type DepartureAnnouncer = { start(): void; stop(): void };

// Says the start-of-session line whenever the local train departs: when it
// first appears running (a session starting) or goes from stopped to running.
// Whatever is already running when the announcer starts is not a departure,
// so coming back to the session page does not replay the line. A driver like
// the player: it reaches the world only through `say`.
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
    const departed = id !== null && phase === "running" && lastPhase !== "running";
    // Record before saying: `say` writes the store, which re-enters this
    // listener synchronously, and it must see the phase as already handled.
    lastPhase = phase;
    if (!departed) return;
    const line = VOICE_LINES.startSession;
    useWorld.getState().say(id, line.text, line.audioUrl);
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
