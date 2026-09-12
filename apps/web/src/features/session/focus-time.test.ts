import { beforeEach, describe, expect, test } from "bun:test";
import { accumulateFocus, focusStep, MAX_FOCUS_STEP_MS, resetFocusClock } from "./focus-time";

// Noon, so adding a few seconds never crosses midnight.
const NOON = new Date(2026, 8, 12, 12, 0, 0).getTime();

beforeEach(() => {
  localStorage.removeItem("grugchug.focus.today");
  resetFocusClock();
});

describe("focusStep", () => {
  test("banks time at the rate of the score", () => {
    expect(focusStep(1, 1000)).toBe(1);
    expect(focusStep(0.5, 1000)).toBe(0.5);
    expect(focusStep(0, 1000)).toBe(0);
  });

  test("a long gap counts no more than the cap", () => {
    expect(focusStep(1, 60_000)).toBe(MAX_FOCUS_STEP_MS / 1000);
  });

  test("time running backwards banks nothing", () => {
    expect(focusStep(1, -500)).toBe(0);
  });
});

describe("accumulateFocus", () => {
  test("the first tick starts the clock, later ticks bank time", () => {
    expect(accumulateFocus(1, NOON)).toBe(0);
    expect(accumulateFocus(1, NOON + 500)).toBeCloseTo(0.5, 6);
    expect(accumulateFocus(0.5, NOON + 1500)).toBeCloseTo(1, 6);
  });

  test("a reload picks up today's total where it left off", () => {
    accumulateFocus(1, NOON);
    accumulateFocus(1, NOON + 2000);

    resetFocusClock();
    expect(accumulateFocus(1, NOON + 60_000)).toBeCloseTo(2, 6);
  });

  test("a new day starts from nothing", () => {
    accumulateFocus(1, NOON);
    accumulateFocus(1, NOON + 2000);

    const tomorrow = NOON + 24 * 60 * 60 * 1000;
    expect(accumulateFocus(1, tomorrow)).toBe(0);
  });
});
