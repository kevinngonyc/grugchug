// UI lifetime for the in-session picker. Scene clicks request it through
// profile's public API; profile saves and world updates stay with their owners.
import { create } from "zustand";

export const useAvatarPickerUi = create<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>((set) => ({ open: false, setOpen: (open) => set({ open }) }));
