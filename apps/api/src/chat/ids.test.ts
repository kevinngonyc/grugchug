import { expect, test } from "bun:test";
import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH, inviteCodeSchema } from "@grugchug/shared";
import { newInviteCode, newUserId, randomString } from "./ids";

test("invite codes match the shared schema", () => {
  for (let i = 0; i < 200; i += 1) {
    const code = newInviteCode();
    expect(code).toHaveLength(INVITE_CODE_LENGTH);
    expect(inviteCodeSchema.safeParse(code).success).toBe(true);
  }
});

test("invite codes use the whole alphabet and are not all the same", () => {
  const codes = new Set(Array.from({ length: 200 }, () => newInviteCode()));
  expect(codes.size).toBeGreaterThan(190);
  for (const code of codes) {
    for (const char of code) expect(INVITE_CODE_ALPHABET).toContain(char);
  }
});

test("user ids are long and unique", () => {
  const ids = new Set(Array.from({ length: 100 }, () => newUserId()));
  expect(ids.size).toBe(100);
  for (const id of ids) expect(id).toHaveLength(32);
});

test("randomString honors a zero length", () => {
  expect(randomString(0, "abc")).toBe("");
});
