import { describe, expect, test } from "bun:test";
import { spriteForUserId } from "./sprite-for-user";

describe("spriteForUserId", () => {
  test("is stable, so you look the same on every screen", () => {
    expect(spriteForUserId("ada")).toBe(spriteForUserId("ada"));
  });

  test("always resolves to a sprite that exists", () => {
    for (const id of ["", "a", "ada", "x".repeat(64), "Rider 4821"]) {
      expect(spriteForUserId(id)).toMatch(/^\/characters\//);
    }
  });
});
