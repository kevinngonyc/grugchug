import { describe, expect, test } from "bun:test";
import { PASS_THRESHOLD, percentOf, stationVerdict } from "./conductor";

describe("stationVerdict", () => {
  test("passes at the mark and fails under it", () => {
    expect(stationVerdict([1, 1, 0.8, 0])).toEqual({ meanScore: 0.7, percent: 70, passed: true });
    expect(stationVerdict([1, 1, 0.76, 0]).passed).toBe(false);
    expect(stationVerdict([1, 1, 0.76, 0]).percent).toBe(69);
  });

  test("decides on the same whole percent it shows, so the two never disagree", () => {
    // 0.695 rounds up to 70% on screen; a verdict from the raw mean would
    // read "70% overall (pass mark 70%) — not passed".
    const verdict = stationVerdict([1, 1, 0.78, 0]);
    expect(verdict.percent).toBe(70);
    expect(verdict.passed).toBe(true);
  });

  test("no scores is a zero, not a division by nothing", () => {
    expect(stationVerdict([])).toEqual({ meanScore: 0, percent: 0, passed: false });
  });

  test("the pass mark on screen is the threshold as a whole percent", () => {
    expect(percentOf(PASS_THRESHOLD)).toBe(70);
    expect(percentOf(0.695)).toBe(70);
    expect(percentOf(0.694)).toBe(69);
  });
});
