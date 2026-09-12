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
    materials: [{ kind: "text" as const, text: "notes" }],
  };
}

function mcq(id: string) {
  return { id, type: "mcq" as const, prompt: `Q ${id}`, choices: ["a", "b"], correctIndex: 0 };
}
function multi(id: string) {
  return {
    id,
    type: "multi" as const,
    prompt: `Q ${id}`,
    choices: ["a", "b", "c"],
    correctIndices: [0, 1],
  };
}
function short(id: string) {
  return { id, type: "short" as const, prompt: `Q ${id}`, rubric: "r", referenceAnswer: "a" };
}

function validQuestions() {
  return [
    mcq("q1"),
    mcq("q2"),
    mcq("q3"),
    mcq("q4"),
    multi("q5"),
    multi("q6"),
    short("q7"),
    short("q8"),
  ];
}

describe("generateQuestionsToolSpec", () => {
  test("accepts exactly 4 mcq, 2 multi and 2 short questions", async () => {
    const questions = validQuestions();
    const resolve = () => fakeProvider(JSON.stringify({ confidence: 0.9, questions }));

    const result = await runTool(generateQuestionsToolSpec, inputFor("valid"), resolve);

    expect(result.output.questions).toEqual(questions);
    expect(result.output).not.toHaveProperty("confidence");
    expect(result.fellBackToFixture).toBe(false);
  });

  test("falls back to the fixture questions when the composition is wrong", async () => {
    // 5 mcq, 1 multi, 2 short instead of 4/2/2.
    const questions = [
      ...validQuestions().slice(0, 4),
      mcq("q9"),
      multi("q5"),
      short("q7"),
      short("q8"),
    ];
    const resolve = () => fakeProvider(JSON.stringify({ questions }));

    const result = await runTool(generateQuestionsToolSpec, inputFor("wrong-composition"), resolve);

    expect(result.fellBackToFixture).toBe(true);
    expect(result.output.questions).toHaveLength(8);
    expect(result.output.questions.filter((q) => q.type === "mcq")).toHaveLength(4);
    expect(result.output.questions.filter((q) => q.type === "multi")).toHaveLength(2);
    expect(result.output.questions.filter((q) => q.type === "short")).toHaveLength(2);
  });

  test("rejects an mcq whose correctIndex is out of range", async () => {
    const questions = [{ ...validQuestions()[0], correctIndex: 5 }, ...validQuestions().slice(1)];
    const resolve = () => fakeProvider(JSON.stringify({ questions }));

    const result = await runTool(generateQuestionsToolSpec, inputFor("bad-correct-index"), resolve);

    expect(result.fellBackToFixture).toBe(true);
  });

  test("rejects a multi question whose correctIndices cover every choice", async () => {
    const bad = { ...multi("q5"), correctIndices: [0, 1, 2] };
    const questions = [...validQuestions().slice(0, 4), bad, ...validQuestions().slice(5)];
    const resolve = () => fakeProvider(JSON.stringify({ questions }));

    const result = await runTool(generateQuestionsToolSpec, inputFor("bad-multi"), resolve);

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
