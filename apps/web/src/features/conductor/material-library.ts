// The materials this session is studying, kept entirely in the browser — no
// server storage, per the user's choice. Every uploaded file is one item, and
// one route covers the whole set, so the plan id is remembered for the set
// rather than per file: pressing Study again reuses that route instead of
// paying for a fresh plan-route + generate-questions run. Adding or removing
// a file makes it a different set, so the remembered route is dropped.
// Sample fallback routes are not remembered. Regenerate route explicitly
// bypasses the saved plan while keeping the uploaded materials.
// Guarded storage access, same pattern as features/chat/storage.ts.
import type { Material } from "@grugchug/shared";
import { create } from "zustand";

const STORAGE_KEY = "grugchug.conductor.library";

export interface MaterialLibraryItem {
  id: string;
  name: string;
  material: Material;
  createdAt: number;
}

interface StoredLibrary {
  items: MaterialLibraryItem[];
  planId: string | null;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isLibraryItem(value: unknown): value is MaterialLibraryItem {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as MaterialLibraryItem).id === "string" &&
    typeof (value as MaterialLibraryItem).name === "string" &&
    typeof (value as MaterialLibraryItem).material === "object"
  );
}

function readLibrary(): StoredLibrary {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return { items: [], planId: null };
    const parsed: unknown = JSON.parse(raw);
    const items: unknown = Array.isArray(parsed) ? parsed : (parsed as StoredLibrary)?.items;
    const planId = Array.isArray(parsed) ? null : ((parsed as StoredLibrary)?.planId ?? null);
    return {
      items: Array.isArray(items) ? items.filter(isLibraryItem) : [],
      planId: typeof planId === "string" ? planId : null,
    };
  } catch {
    return { items: [], planId: null };
  }
}

function writeLibrary(library: StoredLibrary): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(library));
  } catch {
    // Out of quota or blocked: the library still works for this page view.
  }
}

interface MaterialLibraryState extends StoredLibrary {
  add: (name: string, material: Material) => MaterialLibraryItem;
  remove: (id: string) => void;
  setPlanId: (planId: string | null) => void;
}

export const useMaterialLibrary = create<MaterialLibraryState>()((set, get) => ({
  ...readLibrary(),

  add: (name, material) => {
    const item: MaterialLibraryItem = {
      id: crypto.randomUUID(),
      name,
      material,
      createdAt: Date.now(),
    };
    const items = [...get().items, item];
    set({ items, planId: null });
    writeLibrary({ items, planId: null });
    return item;
  },

  remove: (id) => {
    const items = get().items.filter((item) => item.id !== id);
    set({ items, planId: null });
    writeLibrary({ items, planId: null });
  },

  setPlanId: (planId) => {
    set({ planId });
    writeLibrary({ items: get().items, planId });
  },
}));
