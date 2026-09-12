// Offline: a fake provider, no network.
import { describe, expect, test } from "bun:test";
import { runTool } from "../harness";
import type { LLMProvider } from "../provider";
import { planRouteOutputSchema, planRouteToolSpec } from "./plan-route";

function fakeProvider(text: string): LLMProvider {
  return {
    provider: "gemini",
    model: "fake-flash",
    generate: async () => ({ text, provider: "gemini", model: "fake-flash" }),
  };
}

describe("planRouteToolSpec", () => {
  test("accepts a valid stations response from the model", async () => {
    const stations = [
      { id: "a", index: 0, title: "Intro", scope: "Basics", estimatedMinutes: 5 },
      { id: "b", index: 1, title: "Deeper", scope: "Details", estimatedMinutes: 10 },
    ];
    const resolve = () => fakeProvider(JSON.stringify({ stations }));

    const result = await runTool(
      planRouteToolSpec,
      { material: { kind: "text", text: "some notes" }, availableMinutes: 15 },
      resolve,
    );

    expect(result.output.stations).toEqual(stations);
    expect(result.fellBackToFixture).toBe(false);
  });

  test("accepts a request with no availableMinutes at all", async () => {
    const stations = [{ id: "a", index: 0, title: "Intro", scope: "Basics", estimatedMinutes: 5 }];
    const resolve = () => fakeProvider(JSON.stringify({ stations }));

    const result = await runTool(
      planRouteToolSpec,
      { material: { kind: "text", text: "some notes" } },
      resolve,
    );

    expect(result.output.stations).toEqual(stations);
    expect(result.fellBackToFixture).toBe(false);
  });

  test("falls back to the fixture stations, without questions, when the model never produces valid JSON", async () => {
    const resolve = () => fakeProvider("not json");

    const result = await runTool(
      planRouteToolSpec,
      { material: { kind: "text", text: "some notes" }, availableMinutes: 30 },
      resolve,
    );

    expect(result.fellBackToFixture).toBe(true);
    expect(planRouteOutputSchema.safeParse(result.output).success).toBe(true);
    expect(result.output.stations.length).toBeGreaterThan(0);
    for (const station of result.output.stations) {
      expect(station).not.toHaveProperty("questions");
    }
  });

  test("rejects a response with more than the station cap", async () => {
    const tooMany = Array.from({ length: 7 }, (_, i) => ({
      id: `s${i}`,
      index: i,
      title: `Station ${i}`,
      scope: "x",
      estimatedMinutes: 5,
    }));
    const resolve = () => fakeProvider(JSON.stringify({ stations: tooMany }));

    // Every flash attempt returns 7 stations (over MAX_STATIONS), so every
    // attempt fails validation and it falls back to the fixture.
    const result = await runTool(
      planRouteToolSpec,
      { material: { kind: "text", text: "some notes" }, availableMinutes: 60 },
      resolve,
    );

    expect(result.fellBackToFixture).toBe(true);
  });
});
