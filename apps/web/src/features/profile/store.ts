import type { AvatarId, User, UserProfile } from "@grugchug/shared";
import { create } from "zustand";
import { getUserId } from "@/lib/user-id";
import { fetchUser, saveUser } from "./api";
import { DEFAULT_PROFILE } from "./avatars";

export type ProfileStatus = "idle" | "loading" | "ready" | "error";

export type ProfileState = {
  user: User | null;
  status: ProfileStatus;
  load: () => Promise<void>;
  setAvatar: (avatar: AvatarId) => Promise<void>;
};

export type ProfileDeps = {
  getUserId: () => string;
  fetchUser: (id: string) => Promise<User | null>;
  saveUser: (id: string, profile: UserProfile) => Promise<User>;
};

// Built from injectable deps so tests never touch localStorage semantics or
// the network; `useProfile` below is the app's instance.
export function createProfileStore(deps: ProfileDeps) {
  return create<ProfileState>()((set, get) => ({
    user: null,
    status: "idle",

    // GET, and on a fresh browser PUT the default so the record exists. Safe
    // to call from every page that needs the profile; only idle or error
    // states start a load.
    load: async () => {
      const { status } = get();
      if (status === "loading" || status === "ready") return;
      set({ status: "loading" });
      try {
        const id = deps.getUserId();
        const user = (await deps.fetchUser(id)) ?? (await deps.saveUser(id, DEFAULT_PROFILE));
        set({ user, status: "ready" });
      } catch {
        set({ status: "error" });
      }
    },

    // Waits for the server so the store never shows a pick that did not save.
    setAvatar: async (avatar) => {
      const name = get().user?.name ?? DEFAULT_PROFILE.name;
      try {
        const user = await deps.saveUser(deps.getUserId(), { name, avatar });
        set({ user, status: "ready" });
      } catch {
        set({ status: "error" });
      }
    },
  }));
}

export const useProfile = createProfileStore({ getUserId, fetchUser, saveUser });
