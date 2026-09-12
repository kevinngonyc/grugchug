import type { Speech, TrainOwner, TrainPhase, TrainState, WorldSnapshot } from "@grugchug/shared";
import { create } from "zustand";

export type WorldState = {
  trains: Record<string, TrainState>;
  localTrainId: string | null;
  addTrain: (train: TrainState) => void;
  removeTrain: (id: string) => void;
  setLocalTrainId: (id: string | null) => void;
  setPhase: (id: string, phase: TrainPhase) => void;
  setEfficiency: (id: string, efficiency: number) => void;
  say: (id: string, text: string, audioUrl?: string) => void;
  clearSpeech: (id: string, speechId: string) => void;
  setOwner: (id: string, owner: TrainOwner) => void;
  applySnapshot: (snapshot: Pick<WorldSnapshot, "trains">) => void;
};

// Intent only. Eased speeds, scroll offsets, and station positions belong to
// the scene, which reads this store and never writes it.
export const useWorld = create<WorldState>()((set) => ({
  trains: {},
  localTrainId: null,

  addTrain: (train) => set((s) => ({ trains: { ...s.trains, [train.id]: train } })),

  removeTrain: (id) =>
    set((s) => {
      const trains = { ...s.trains };
      delete trains[id];
      return {
        trains,
        localTrainId: s.localTrainId === id ? null : s.localTrainId,
      };
    }),

  setLocalTrainId: (id) => set({ localTrainId: id }),

  setPhase: (id, phase) => set((s) => patchTrain(s, id, { phase })),

  setEfficiency: (id, efficiency) =>
    set((s) =>
      patchTrain(s, id, {
        efficiency: Math.min(1, Math.max(0, efficiency)),
      }),
    ),

  // One utterance per train. A new line replaces whatever was up.
  say: (id, text, audioUrl) =>
    set((s) => {
      const speech: Speech = { id: crypto.randomUUID(), text, audioUrl };
      return patchTrain(s, id, { speech });
    }),

  // Only the utterance that finished may clear itself; a newer line stays.
  clearSpeech: (id, speechId) =>
    set((s) => {
      const train = s.trains[id];
      if (!train || train.speech?.id !== speechId) return {};
      const cleared: TrainState = { ...train };
      delete cleared.speech;
      return { trains: { ...s.trains, [id]: cleared } };
    }),

  setOwner: (id, owner) => set((s) => patchTrain(s, id, { owner })),

  // Remote state wins for every train except ours; trains missing from the
  // snapshot are gone.
  applySnapshot: (snapshot) =>
    set((s) => {
      const trains: Record<string, TrainState> = { ...snapshot.trains };
      const local = s.localTrainId === null ? undefined : s.trains[s.localTrainId];
      if (local) trains[local.id] = local;
      return { trains };
    }),
}));

function patchTrain(s: WorldState, id: string, patch: Partial<TrainState>): Partial<WorldState> {
  const train = s.trains[id];
  if (!train) return {};
  return { trains: { ...s.trains, [id]: { ...train, ...patch } } };
}
