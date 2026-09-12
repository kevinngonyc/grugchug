import { beforeEach, describe, expect, test } from "bun:test";
import { FOCUS_MIN_INTERVAL_MS, reportFocus, setFocusSink } from "./focus-link";

let sent: number[] = [];

beforeEach(() => {
  sent = [];
  setFocusSink((efficiency) => sent.push(efficiency));
});

describe("reportFocus", () => {
  test("does nothing without a socket to send on", () => {
    setFocusSink(null);
    reportFocus(0.5, 0);
    expect(sent).toEqual([]);
  });

  test("the first reading always goes out", () => {
    reportFocus(0.42, 0);
    expect(sent).toEqual([0.42]);
  });

  test("ignores a reading that has barely moved", () => {
    reportFocus(0.5, 0);
    reportFocus(0.505, 10 * FOCUS_MIN_INTERVAL_MS);
    expect(sent).toEqual([0.5]);
  });

  test("holds a real change until the interval is up", () => {
    reportFocus(0.5, 0);
    reportFocus(0.9, FOCUS_MIN_INTERVAL_MS - 1);
    expect(sent).toEqual([0.5]);
    reportFocus(0.9, FOCUS_MIN_INTERVAL_MS);
    expect(sent).toEqual([0.5, 0.9]);
  });

  test("a reconnect reports again even if the score has not moved", () => {
    reportFocus(0.5, 0);
    setFocusSink((efficiency) => sent.push(efficiency));
    reportFocus(0.5, 1);
    expect(sent).toEqual([0.5, 0.5]);
  });

  test("clamps whatever it is handed into 0..1", () => {
    reportFocus(4, 0);
    expect(sent).toEqual([1]);
  });
});
