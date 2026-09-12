import { describe, expect, test } from "bun:test";
import { MAX_SPEED, MIN_SPEED } from "@/features/world";
import { ACCEL, BRAKE_DECEL, DRIFT_CLOSE_MAX_SPEED, DRIFT_CLOSE_TOLERANCE } from "./constants";
import { createMotion, driftClosing, driftGap, stepMotion } from "./motion";

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

describe("driftGap", () => {
  test("is the distance along the track between two trains", () => {
    const m = createMotion();
    m.scroll = 118;
    expect(driftGap(m, 100)).toBe(18);
    m.scroll = 94;
    expect(driftGap(m, 100)).toBe(-6);
    m.scroll = 100;
    expect(driftGap(m, 100)).toBe(0);
  });

  test("nothing holds a train back: the gap keeps growing", () => {
    const lane = createMotion();
    const flyer = createMotion();
    const run = (seconds: number) => {
      for (let i = 0; i < seconds * 60; i++) {
        stepMotion(lane, MIN_SPEED, MIN_SPEED, 1 / 60);
        stepMotion(flyer, MAX_SPEED, MAX_SPEED, 1 / 60);
      }
      return driftGap(flyer, lane.scroll);
    };

    const atTen = run(10);
    const atTwenty = run(10);
    // Far out of frame at ten seconds, and twice as far again by twenty: the
    // gap is a real distance, not something that settles at an edge.
    expect(atTen).toBeGreaterThan(50);
    expect(atTwenty - atTen).toBeGreaterThan(atTen);
  });

  test("a faster train pulls ahead, a slower one falls back", () => {
    const lane = createMotion();
    const flyer = createMotion();
    const slacker = createMotion();
    for (let i = 0; i < 300; i++) {
      stepMotion(lane, 4, 4, 1 / 60);
      stepMotion(flyer, 9, 9, 1 / 60);
      stepMotion(slacker, 1, 1, 1 / 60);
    }
    expect(driftGap(flyer, lane.scroll)).toBeGreaterThan(0);
    expect(driftGap(slacker, lane.scroll)).toBeLessThan(0);
  });

  test("closing the gap starts moving the train the moment it slows", () => {
    const lane = createMotion();
    const flyer = createMotion();
    for (let i = 0; i < 600; i++) {
      stepMotion(lane, 8, 8, 1 / 60);
      stepMotion(flyer, 12, 12, 1 / 60);
    }
    const led = driftGap(flyer, lane.scroll);
    for (let i = 0; i < 600; i++) {
      stepMotion(lane, 8, 8, 1 / 60);
      stepMotion(flyer, 1, 1, 1 / 60);
    }
    // No stored lead to unwind first: as soon as it is the slower train the
    // gap starts closing.
    expect(driftGap(flyer, lane.scroll)).toBeLessThan(led);
  });
});

describe("driftClosing", () => {
  const dt = 1 / 60;

  test("does nothing while the two trains disagree about speed", () => {
    expect(driftClosing(40, DRIFT_CLOSE_TOLERANCE, dt)).toBe(0);
    expect(driftClosing(40, 9, dt)).toBe(0);
    expect(driftClosing(-40, -9, dt)).toBe(0);
  });

  test("gives the gap back once they agree, whichever side it is on", () => {
    expect(driftClosing(40, 0, dt)).toBeGreaterThan(0);
    expect(driftClosing(-40, 0, dt)).toBeLessThan(0);
  });

  test("eases in as the speeds converge rather than switching on", () => {
    const agreed = driftClosing(40, 0, dt);
    const nearly = driftClosing(40, DRIFT_CLOSE_TOLERANCE / 2, dt);
    expect(nearly).toBeGreaterThan(0);
    expect(nearly).toBeLessThan(agreed);
  });

  test("comes back into shot at a walk, whatever it is returning from", () => {
    // What the cap governs is off-screen; what you watch is the last few
    // metres, where the proportional part has taken over.
    expect(driftClosing(4_000, 0, 1)).toBeLessThanOrEqual(DRIFT_CLOSE_MAX_SPEED);
    expect(driftClosing(9, 0, 1)).toBeLessThan(4);
  });

  test("never overshoots: the gap shuts, it does not swing past", () => {
    expect(driftClosing(0.001, 0, 10)).toBe(0.001);
    expect(driftClosing(-0.001, 0, 10)).toBe(-0.001);
    expect(driftClosing(0, 0, dt)).toBe(0);
  });

  test("a lull brings a friend who vanished back into frame", () => {
    const lane = createMotion();
    const flyer = createMotion();
    const lull = (seconds: number) => {
      for (let i = 0; i < seconds * 60; i++) {
        stepMotion(lane, MIN_SPEED, MIN_SPEED, 1 / 60);
        stepMotion(flyer, MIN_SPEED, MIN_SPEED, 1 / 60);
        const drifted = driftGap(flyer, lane.scroll);
        flyer.scroll =
          lane.scroll + drifted - driftClosing(drifted, flyer.speed - lane.speed, 1 / 60);
      }
      return driftGap(flyer, lane.scroll);
    };

    // Two minutes of studying much harder than you, and they are long gone —
    // over a kilometre up the line.
    for (let i = 0; i < 120 * 60; i++) {
      stepMotion(lane, MIN_SPEED, MIN_SPEED, 1 / 60);
      stepMotion(flyer, MAX_SPEED, MAX_SPEED, 1 / 60);
    }
    expect(driftGap(flyer, lane.scroll)).toBeGreaterThan(1_000);

    // Then they settle to your speed. Nothing is chasing anything: both run at
    // the same rate, and the gap alone unwinds — back inside the frame within
    // a minute rather than gone for the rest of the session.
    expect(lull(60)).toBeLessThan(10);
    expect(lull(30)).toBeLessThan(1);
  });
});
