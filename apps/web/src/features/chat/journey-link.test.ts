import { beforeEach, describe, expect, test } from "bun:test";
import type { Journey } from "@grugchug/shared";
import { reportJourney, setJourneySink } from "./journey-link";

const studying: Journey = { state: "studying", station: { index: 1, total: 3 } };
const atStation: Journey = { state: "at-station", station: { index: 1, total: 3 } };

beforeEach(() => setJourneySink(null));

describe("reportJourney", () => {
  test("sends a status once and ignores repeats", () => {
    const sent: unknown[] = [];
    setJourneySink((s) => sent.push(s));
    reportJourney({ avatar: "cat", journey: studying });
    reportJourney({ avatar: "cat", journey: { ...studying, station: { index: 1, total: 3 } } });
    reportJourney({ avatar: "cat", journey: atStation });
    expect(sent).toEqual([
      { avatar: "cat", journey: studying },
      { avatar: "cat", journey: atStation },
    ]);
  });

  test("a new sink gets the last status again", () => {
    reportJourney({ avatar: "doug", journey: studying });
    const sent: unknown[] = [];
    setJourneySink((s) => sent.push(s));
    expect(sent).toEqual([{ avatar: "doug", journey: studying }]);
  });

  test("does nothing without a sink", () => {
    expect(() => reportJourney({ avatar: "poku", journey: studying })).not.toThrow();
  });
});
