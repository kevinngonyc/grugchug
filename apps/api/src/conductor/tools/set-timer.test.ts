// Offline: a fake provider, no network.
import { describe, expect, test } from "bun:test";
import { runTool } from "../harness";
import type { LLMProvider } from "../provider";
import { setTimerToolSpec } from "./set-timer";

function fakeProvider(text: string): LLMProvider {
  return {
    provider: "gemini",
    model: "fake-flash",
    generate: async () => ({ text, provider: "gemini", model: "fake-flash" }),
  };
}

describe("setTimerToolSpec", () => {
  test("returns the model's suggested duration for a study reason", async () => {
    const resolve = () =>
      fakeProvider(JSON.stringify({ confidence: 0.9, minutes: 18, message: "Let's dig in." }));

    const result = await runTool(
      setTimerToolSpec,
      { reason: "study", scope: "Photosynthesis basics" },
      resolve,
    );

    expect(result.output).toEqual({ minutes: 18, message: "Let's dig in." });
    expect(result.output).not.toHaveProperty("confidence");
  });

  test("rejects a duration over the sanity cap and eventually falls back", async () => {
    const resolve = () =>
      fakeProvider(JSON.stringify({ confidence: 0.9, minutes: 400, message: "Take your time." }));

    const result = await runTool(
      setTimerToolSpec,
      { reason: "break", previousMinutes: 40 },
      resolve,
    );

    expect(result.fellBackToFixture).toBe(true);
    expect(result.output.minutes).toBeLessThanOrEqual(180);
  });

  test("falls back to a reason-appropriate default when every attempt fails", async () => {
    const resolve = () => fakeProvider("not json");

    const studyResult = await runTool(setTimerToolSpec, { reason: "study" }, resolve);
    const breakResult = await runTool(setTimerToolSpec, { reason: "break" }, resolve);

    expect(studyResult.fellBackToFixture).toBe(true);
    expect(breakResult.fellBackToFixture).toBe(true);
    expect(typeof studyResult.output.minutes).toBe("number");
    expect(typeof breakResult.output.minutes).toBe("number");
  });
});
