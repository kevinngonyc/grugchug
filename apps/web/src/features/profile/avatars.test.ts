import { describe, expect, test } from "bun:test";
import { avatarIdSchema } from "@grugchug/shared";
import { AVATARS, avatarUrl, DEFAULT_PROFILE, profileOwner } from "./avatars";

describe("avatars", () => {
  test("AVATARS has one entry per avatar id, in enum order", () => {
    expect(AVATARS.map((a) => a.id)).toEqual([...avatarIdSchema.options]);
    for (const a of AVATARS) expect(a.name.length).toBeGreaterThan(0);
  });

  test("avatarUrl points into public/characters", () => {
    expect(avatarUrl("poku")).toBe("/characters/poku.png");
  });

  test("profileOwner falls back to the default profile", () => {
    expect(profileOwner(null)).toEqual({
      name: DEFAULT_PROFILE.name,
      spriteUrl: "/characters/poku.png",
    });
  });

  test("profileOwner uses the user's name and avatar", () => {
    const user = {
      id: "u1",
      name: "Ada",
      avatar: "conductor" as const,
      createdAt: "2026-09-11T00:00:00.000Z",
    };
    expect(profileOwner(user)).toEqual({ name: "Ada", spriteUrl: "/characters/conductor.png" });
  });
});
