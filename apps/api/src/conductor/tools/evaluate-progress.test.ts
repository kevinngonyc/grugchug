// Offline: a fake provider, no network.
import { describe, expect, test } from "bun:test";
import { runTool } from "../harness";
import type { LLMProvider } from "../provider";
import { evaluateProgressToolSpec } from "./evaluate-progress";

function fakeProvider(text: string): LLMProvider {
  return {
    provider: "gemini",
    model: "fake-flash",
    generate: async () => ({ text, provider: "gemini", model: "fake-flash" }),
  };
}

const goodResults = [
  { prompt: "Q1", answerGiven: "a", score: 1, feedback: "Correct." },
  { prompt: "Q2", answerGiven: "b", score: 0.9, feedback: "Close enough." },
];

describe("evaluateProgressToolSpec", () => {
  test("passes when the model judges the results strong enough", async () => {
    const resolve = () =>
      fakeProvider(JSON.stringify({ confidence: 0.9, passed: true, feedback: "Solid grasp." }));

    const result = await runTool(
      evaluateProgressToolSpec,
      { scope: "unique-strong-case", results: goodResults },
      resolve,
    );

    expect(result.output).toEqual({ passed: true, feedback: "Solid grasp." });
    expect(result.output).not.toHaveProperty("confidence");
  });

  test("never sends the source material — only scope and per-question summaries reach the prompt", () => {
    const parts = evaluateProgressToolSpec.prompt({
      scope: "Photosynthesis",
      results: goodResults,
    });
    expect(parts.every((p) => p.kind === "text")).toBe(true);
    const text = parts.map((p) => (p.kind === "text" ? p.text : "")).join("\n");
    expect(text).toContain("Photosynthesis");
    expect(text).toContain("Q1");
    expect(text).toContain("Q2");
  });

  test("falls back to not-passed when every attempt fails", async () => {
    const resolve = () => fakeProvider("not json");

    const result = await runTool(
      evaluateProgressToolSpec,
      { scope: "unique-fallback-case", results: goodResults },
      resolve,
    );

    expect(result.fellBackToFixture).toBe(true);
    expect(result.output.passed).toBe(false);
  });
});
