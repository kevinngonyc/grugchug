// Offline: a fake provider, no network.
import { describe, expect, test } from "bun:test";
import { runTool } from "../harness";
import type { LLMProvider } from "../provider";
import { generateQuestionsToolSpec } from "./generate-questions";

function fakeProvider(text: string): LLMProvider {
  return {
    provider: "gemini",
    model: "fake-flash",
    generate: async () => ({ text, provider: "gemini", model: "fake-flash" }),
  };
}

function inputFor(caseName: string) {
  return {
    scope: `Photosynthesis basics (${caseName})`,
    material: { kind: "text" as const, text: "notes" },
  };
}

function mcq(id: string) {
  return { id, type: "mcq" as const, prompt: `Q ${id}`, choices: ["a", "b"], correctIndex: 0 };
}
function short(id: string) {
  return { id, type: "short" as const, prompt: `Q ${id}`, rubric: "r", referenceAnswer: "a" };
}

describe("generateQuestionsToolSpec", () => {
  test("accepts exactly 3 mcq and 1 short question", async () => {
    const questions = [mcq("q1"), mcq("q2"), mcq("q3"), short("q4")];
    const resolve = () => fakeProvider(JSON.stringify({ confidence: 0.9, questions }));

    const result = await runTool(generateQuestionsToolSpec, inputFor("valid"), resolve);

    expect(result.output.questions).toEqual(questions);
    expect(result.output).not.toHaveProperty("confidence");
    expect(result.fellBackToFixture).toBe(false);
  });

  test("falls back to the fixture questions when the composition is wrong", async () => {
    const questions = [mcq("q1"), mcq("q2"), short("q3"), short("q4")]; // 2 mcq, 2 short
    const resolve = () => fakeProvider(JSON.stringify({ questions }));

    const result = await runTool(generateQuestionsToolSpec, inputFor("wrong-composition"), resolve);

    expect(result.fellBackToFixture).toBe(true);
    expect(result.output.questions).toHaveLength(4);
    expect(result.output.questions.filter((q) => q.type === "mcq")).toHaveLength(3);
    expect(result.output.questions.filter((q) => q.type === "short")).toHaveLength(1);
  });

  test("rejects an mcq whose correctIndex is out of range", async () => {
    const questions = [{ ...mcq("q1"), correctIndex: 5 }, mcq("q2"), mcq("q3"), short("q4")];
    const resolve = () => fakeProvider(JSON.stringify({ questions }));

    const result = await runTool(generateQuestionsToolSpec, inputFor("bad-correct-index"), resolve);

    expect(result.fellBackToFixture).toBe(true);
  });

  test("asks the model for an internal confidence field", () => {
    const text = generateQuestionsToolSpec
      .prompt(inputFor("prompt"))
      .map((p) => (p.kind === "text" ? p.text : ""))
      .join("\n");
    expect(text).toContain("confidence");
  });
});
