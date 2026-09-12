import { beforeEach, describe, expect, test } from "bun:test";
import { FOCUS_MIN_INTERVAL_MS, type FocusReport, reportFocus, setFocusSink } from "./focus-link";

let sent: FocusReport[] = [];

function efficiencies(): number[] {
  return sent.map((report) => report.efficiency);
}

beforeEach(() => {
  sent = [];
  setFocusSink((report) => sent.push(report));
});

describe("reportFocus", () => {
  test("does nothing without a socket to send on", () => {
    setFocusSink(null);
    reportFocus(0.5, 0, 0);
    expect(sent).toEqual([]);
  });

  test("the first reading always goes out", () => {
    reportFocus(0.42, 12, 0);
    expect(sent).toEqual([{ efficiency: 0.42, focusedSeconds: 12 }]);
  });

  test("ignores a reading that has barely moved", () => {
    reportFocus(0.5, 10, 0);
    reportFocus(0.505, 10.5, 10 * FOCUS_MIN_INTERVAL_MS);
    expect(efficiencies()).toEqual([0.5]);
  });

  test("holds a real change until the interval is up", () => {
    reportFocus(0.5, 0, 0);
    reportFocus(0.9, 0, FOCUS_MIN_INTERVAL_MS - 1);
    expect(efficiencies()).toEqual([0.5]);
    reportFocus(0.9, 0, FOCUS_MIN_INTERVAL_MS);
    expect(efficiencies()).toEqual([0.5, 0.9]);
  });

  test("a steady score still sends once the banked time has grown", () => {
    reportFocus(0.5, 10, 0);
    reportFocus(0.5, 13, FOCUS_MIN_INTERVAL_MS);
    expect(sent).toEqual([
      { efficiency: 0.5, focusedSeconds: 10 },
      { efficiency: 0.5, focusedSeconds: 13 },
    ]);
  });

  test("a reconnect reports again even if nothing has moved", () => {
    reportFocus(0.5, 10, 0);
    setFocusSink((report) => sent.push(report));
    reportFocus(0.5, 10, 1);
    expect(efficiencies()).toEqual([0.5, 0.5]);
  });

  test("clamps whatever it is handed into range", () => {
    reportFocus(4, -3, 0);
    expect(sent).toEqual([{ efficiency: 1, focusedSeconds: 0 }]);
  });
});
