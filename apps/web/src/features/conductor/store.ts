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

// Closing always marks this whole region aria-hidden, but the button that
// just closed it (Continue, Submit, the X) is still focused when that
// happens — the browser blocks hiding a focused descendant. Blurring first
// avoids it; there's nothing useful to move focus to instead, since the
// panel is gone.
function blurWithin(): void {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

export const useConductorUi = create<ConductorUiState>((set) => ({
  open: false,
  openPanel: () => set({ open: true }),
  closePanel: () => {
    blurWithin();
    set({ open: false });
  },
  toggle: () =>
    set((s) => {
      if (s.open) blurWithin();
      return { open: !s.open };
    }),
}));
