import { describe, expect, test } from "bun:test";
import type { User, UserProfile } from "@grugchug/shared";
import { DEFAULT_PROFILE } from "./avatars";
import { createProfileStore, type ProfileDeps } from "./store";

const existing: User = {
  id: "u1",
  name: "You",
  avatar: "conductor",
  createdAt: "2026-09-11T00:00:00.000Z",
};

function fakeDeps(record: User | null, opts: { fetchFails?: boolean } = {}) {
  const saved: UserProfile[] = [];
  let current = record;
  const deps: ProfileDeps = {
    getUserId: () => "u1",
    fetchUser: async () => {
      if (opts.fetchFails) throw new Error("network down");
      return current;
    },
    saveUser: async (id, profile) => {
      saved.push(profile);
      current = { id, ...profile, createdAt: "2026-09-11T00:00:00.000Z" };
      return current;
    },
  };
  return { deps, saved };
}

describe("profile store", () => {
  test("load creates the default profile on a fresh browser", async () => {
    const { deps, saved } = fakeDeps(null);
    const store = createProfileStore(deps);
    await store.getState().load();
    expect(store.getState().status).toBe("ready");
    expect(store.getState().user?.avatar).toBe("poku");
    expect(saved).toEqual([DEFAULT_PROFILE]);
  });

  test("load uses an existing record without saving", async () => {
    const { deps, saved } = fakeDeps(existing);
    const store = createProfileStore(deps);
    await store.getState().load();
    expect(store.getState().user).toEqual(existing);
    expect(saved).toEqual([]);
  });

  test("load reports error when the API is unreachable", async () => {
    const { deps } = fakeDeps(null, { fetchFails: true });
    const store = createProfileStore(deps);
    await store.getState().load();
    expect(store.getState().status).toBe("error");
    expect(store.getState().user).toBeNull();
  });

  test("load is a no-op once ready", async () => {
    const { deps, saved } = fakeDeps(null);
    const store = createProfileStore(deps);
    await store.getState().load();
    await store.getState().load();
    expect(saved).toHaveLength(1);
  });

  test("setAvatar saves the new avatar with the current name", async () => {
    const { deps, saved } = fakeDeps(existing);
    const store = createProfileStore(deps);
    await store.getState().load();
    await store.getState().setAvatar("bonbon");
    expect(saved).toEqual([{ name: "You", avatar: "bonbon" }]);
    expect(store.getState().user?.avatar).toBe("bonbon");
    expect(store.getState().status).toBe("ready");
  });

  test("setAvatar failure keeps the last user and reports error", async () => {
    const { deps } = fakeDeps(existing);
    deps.saveUser = async () => {
      throw new Error("network down");
    };
    const store = createProfileStore(deps);
    await store.getState().load();
    await store.getState().setAvatar("bonbon");
    expect(store.getState().user).toEqual(existing);
    expect(store.getState().status).toBe("error");
  });
});
