import { describe, expect, test } from "bun:test";
import type { PublicRoutePlan } from "@grugchug/shared";
import { askStationId } from "./ask-panel";

const plan: PublicRoutePlan = {
  id: "plan-1",
  userId: "u1",
  materialHash: "h",
  totalEstimatedMinutes: 20,
  stations: [
    {
      id: "s1",
      index: 0,
      title: "One",
      scope: "first",
      estimatedMinutes: 10,
      questions: [],
    },
    {
      id: "s2",
      index: 1,
      title: "Two",
      scope: "second",
      estimatedMinutes: 10,
      questions: [],
    },
  ],
};

describe("askStationId", () => {
  test("omits stationId before studying starts", () => {
    expect(askStationId(plan, 0, "idle")).toBeUndefined();
  });

  test("passes the current station once a session is underway", () => {
    expect(askStationId(plan, 0, "counting")).toBe("s1");
    expect(askStationId(plan, 1, "at-station")).toBe("s2");
  });

  test("omits stationId when there is no plan", () => {
    expect(askStationId(null, 0, "counting")).toBeUndefined();
  });
});
