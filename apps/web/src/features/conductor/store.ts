// Whether the conductor's study panel is open. This is UI state only — the
// actual study session (plan, timer, station) is Stage C's use-study-session
// hook. features/scene reads and writes this (clicking the conductor
// character toggles it, the camera rig reads it to zoom in), which is the
// one place scene reaches across a feature boundary, through this public
// export rather than any internal file.
import { create } from "zustand";

interface ConductorUiState {
  open: boolean;
  openPanel: () => void;
  closePanel: () => void;
  toggle: () => void;
}

export const useConductorUi = create<ConductorUiState>((set) => ({
  open: false,
  openPanel: () => set({ open: true }),
  closePanel: () => set({ open: false }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
