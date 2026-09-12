import { describe, expect, test } from "bun:test";
import { avatarIdSchema, userProfileSchema, userSchema } from "./user";

const user = {
  id: "u1",
  name: "You",
  avatar: "poku" as const,
  createdAt: "2026-09-11T00:00:00.000Z",
};

describe("userSchema", () => {
  test("accepts a user with an avatar", () => {
    expect(userSchema.parse(user)).toEqual(user);
  });

  test("rejects a user without an avatar", () => {
    const { avatar: _avatar, ...noAvatar } = user;
    expect(userSchema.safeParse(noAvatar).success).toBe(false);
  });
});

describe("userProfileSchema", () => {
  test("accepts name and avatar", () => {
    const profile = { name: "You", avatar: "conductor" as const };
    expect(userProfileSchema.parse(profile)).toEqual(profile);
  });

  test("rejects an unknown avatar", () => {
    expect(userProfileSchema.safeParse({ name: "You", avatar: "dragon" }).success).toBe(false);
  });

  test("strips fields the client may not set", () => {
    const parsed = userProfileSchema.parse({ ...user, name: "Ada" });
    expect(parsed).toEqual({ name: "Ada", avatar: "poku" });
  });
});

test("avatarIdSchema lists every drawing in public/characters", () => {
  expect(avatarIdSchema.options).toEqual([
    "conductor",
    "bonbon",
    "poku",
    "cat",
    "doug",
    "bbob",
    "bilby",
  ]);
});
