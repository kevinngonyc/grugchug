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

  test("falls back to a canned answer when every attempt fails", async () => {
    const resolve = () => fakeProvider("not json");

    const result = await runTool(askConductorToolSpec, { scope: "x", question: "y" }, resolve);

    expect(result.fellBackToFixture).toBe(true);
    expect(typeof result.output.answer).toBe("string");
  });
});
