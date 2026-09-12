import { describe, expect, test } from "bun:test";
import { ACCEL, BRAKE_DECEL } from "./constants";
import { createMotion, stepMotion } from "./motion";

describe("stepMotion", () => {
  test("accelerates toward the target at ACCEL", () => {
    const m = createMotion();
    stepMotion(m, 8, 8, 1);
    expect(m.speed).toBeCloseTo(ACCEL);
    expect(m.scroll).toBeCloseTo(ACCEL);
  });

  test("never overshoots the target", () => {
    const m = createMotion();
    m.speed = 7.9;
    stepMotion(m, 8, 8, 1);
    expect(m.speed).toBe(8);
  });

  test("slows toward a lower target at BRAKE_DECEL", () => {
    const m = createMotion();
    m.speed = 8;
    stepMotion(m, 8, 2, 1);
    expect(m.speed).toBeCloseTo(8 - BRAKE_DECEL);
  });

  test("comes to rest exactly at stopTarget", () => {
    const m = createMotion();
    m.speed = 8;
    m.stopTarget = 20;
    for (let i = 0; i < 600; i++) stepMotion(m, 8, 0, 1 / 60);
    expect(m.scroll).toBe(20);
    expect(m.speed).toBe(0);
  });

  test("keeps cruising while a stop is pending until the brakes must bite", () => {
    const m = createMotion();
    m.speed = 8;
    m.stopTarget = 100;
    stepMotion(m, 8, 0, 1 / 60);
    expect(m.speed).toBe(8);
  });
});
