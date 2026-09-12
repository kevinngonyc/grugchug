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
  test("returns the model's feedback", async () => {
    const resolve = () =>
      fakeProvider(JSON.stringify({ confidence: 0.9, feedback: "Solid grasp." }));

    const result = await runTool(
      evaluateProgressToolSpec,
      { scope: "unique-strong-case", results: goodResults, passed: true, meanScore: 0.95 },
      resolve,
    );

    expect(result.output).toEqual({ feedback: "Solid grasp." });
    expect(result.output).not.toHaveProperty("confidence");
  });

  test("tells the model the score and the decided verdict, never the source material", () => {
    const parts = evaluateProgressToolSpec.prompt({
      scope: "Photosynthesis",
      results: goodResults,
      passed: false,
      meanScore: 0.55,
    });
    expect(parts.every((p) => p.kind === "text")).toBe(true);
    const text = parts.map((p) => (p.kind === "text" ? p.text : "")).join("\n");
    expect(text).toContain("Photosynthesis");
    expect(text).toContain("Q1");
    expect(text).toContain("overall score is 55% and the pass mark is 70%");
    expect(text).toContain("not passed yet");
    expect(evaluateProgressToolSpec.system).toContain("never contradict it");
  });

  test("falls back to feedback that matches the verdict when every attempt fails", async () => {
    const resolve = () => fakeProvider("not json");

    const failed = await runTool(
      evaluateProgressToolSpec,
      { scope: "unique-fallback-case", results: goodResults, passed: false, meanScore: 0.4 },
      resolve,
    );
    expect(failed.fellBackToFixture).toBe(true);
    expect(failed.output.feedback).toContain("Not quite yet");

    const passed = await runTool(
      evaluateProgressToolSpec,
      { scope: "unique-fallback-pass-case", results: goodResults, passed: true, meanScore: 0.9 },
      resolve,
    );
    expect(passed.output.feedback).toContain("You passed");
  });
});
