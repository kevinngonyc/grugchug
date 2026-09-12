import { describe, expect, test } from "bun:test";
import { MAX_SPEED, MIN_SPEED, targetSpeed } from "./speed";

describe("targetSpeed", () => {
  test("is zero when stopped or finished", () => {
    expect(targetSpeed({ phase: "stopped", efficiency: 1 })).toBe(0);
    expect(targetSpeed({ phase: "finished", efficiency: 1 })).toBe(0);
  });

  test("spans MIN_SPEED to MAX_SPEED with efficiency", () => {
    expect(targetSpeed({ phase: "running", efficiency: 0 })).toBe(MIN_SPEED);
    expect(targetSpeed({ phase: "running", efficiency: 1 })).toBe(MAX_SPEED);
    expect(targetSpeed({ phase: "running", efficiency: 0.5 })).toBe((MIN_SPEED + MAX_SPEED) / 2);
  });

  test("clamps efficiency outside 0..1", () => {
    expect(targetSpeed({ phase: "running", efficiency: -3 })).toBe(MIN_SPEED);
    expect(targetSpeed({ phase: "running", efficiency: 9 })).toBe(MAX_SPEED);
  });
});
