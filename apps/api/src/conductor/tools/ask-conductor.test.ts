// Offline: a fake provider, no network.
import { describe, expect, test } from "bun:test";
import { runTool } from "../harness";
import type { LLMProvider } from "../provider";
import { askConductorToolSpec } from "./ask-conductor";

function fakeProvider(text: string): LLMProvider {
  return {
    provider: "gemini",
    model: "fake-flash",
    generate: async () => ({ text, provider: "gemini", model: "fake-flash" }),
  };
}

describe("askConductorToolSpec", () => {
  test("answers using the station scope as context", async () => {
    const resolve = () =>
      fakeProvider(JSON.stringify({ answer: "Because chlorophyll absorbs red and blue." }));

    const result = await runTool(
      askConductorToolSpec,
      { scope: "Light and pigments", question: "Why are leaves green?" },
      resolve,
    );

    expect(result.output.answer).toBe("Because chlorophyll absorbs red and blue.");
  });

  test("prompts the model to look for a connection before declaring a question out of scope", () => {
    const parts = askConductorToolSpec.prompt({ scope: "Light and pigments", question: "y" });
    const text = parts.map((p) => (p.kind === "text" ? p.text : "")).join("\n");
    expect(text).toContain("look for a real connection");
    expect(text).toContain("Only say a question is out of scope after genuinely failing");
  });

  test("attaches the material first, and the conversation before the new question", () => {
    const parts = askConductorToolSpec.prompt({
      scope: "Light and pigments",
      question: "what does the b one absorb?",
      history: [{ question: "Name two pigments", answer: "Chlorophyll a and b." }],
      materials: [{ kind: "text", text: "lecture one" }],
    });
    expect(parts[0]).toEqual({ kind: "text", text: "lecture one" });
    const text = parts.map((p) => (p.kind === "text" ? p.text : "")).join("\n");
    expect(text).toContain("The course material is attached above");
    expect(text).toContain("Learner: Name two pigments\nYou: Chlorophyll a and b.");
    expect(text.indexOf("Name two pigments")).toBeLessThan(
      text.indexOf("what does the b one absorb?"),
    );
  });

  test("without stored material, says it is answering from the station description", () => {
    const parts = askConductorToolSpec.prompt({ scope: "Light and pigments", question: "y" });
    expect(parts).toHaveLength(1);
    const text = parts.map((p) => (p.kind === "text" ? p.text : "")).join("\n");
    expect(text).toContain("You have the station's description, not the material itself");
  });

  test("falls back to a canned answer when every attempt fails", async () => {
    const resolve = () => fakeProvider("not json");

    const result = await runTool(askConductorToolSpec, { scope: "x", question: "y" }, resolve);

    expect(result.fellBackToFixture).toBe(true);
    expect(typeof result.output.answer).toBe("string");
  });
});
