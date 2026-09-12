// Offline: every provider here is a fake in-memory function, no network.
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { runTool, type ToolSpec } from "./harness";
import type { LLMProvider, ProviderPart, Tier } from "./provider";

const outputSchema = z.object({ answer: z.number() });
type Output = z.infer<typeof outputSchema>;

function fakeProvider(vendor: "gemini" | "groq", model: string, text: string): LLMProvider {
  return {
    provider: vendor,
    model,
    generate: async () => ({ text, provider: vendor, model }),
  };
}

function makeSpec(
  overrides: Partial<ToolSpec<{ q: string }, Output>> = {},
): ToolSpec<{ q: string }, Output> {
  return {
    name: "test-tool",
    inputSchema: z.object({ q: z.string() }),
    outputSchema,
    prompt: (input) => [{ kind: "text", text: input.q } satisfies ProviderPart],
    fixture: () => ({ answer: -1 }),
    ...overrides,
  };
}

describe("runTool", () => {
  test("succeeds on the first flash attempt without escalating", async () => {
    const spec = makeSpec();
    const resolve = (tier: Tier) => fakeProvider("gemini", `gemini-${tier}`, '{"answer": 42}');

    const result = await runTool(spec, { q: "unique-first-attempt-case" }, resolve);

    expect(result.output).toEqual({ answer: 42 });
    expect(result.fellBackToFixture).toBe(false);
    expect(result.trace).toHaveLength(1);
    expect(result.trace[0]).toMatchObject({ tier: "flash", escalated: false, ok: true });
  });

  test("retries flash on invalid JSON, then succeeds", async () => {
    const spec = makeSpec();
    let calls = 0;
    const resolve = (): LLMProvider => ({
      provider: "gemini",
      model: "gemini-flash",
      generate: async () => {
        calls++;
        return calls === 1
          ? { text: "not json", provider: "gemini", model: "gemini-flash" }
          : { text: '{"answer": 7}', provider: "gemini", model: "gemini-flash" };
      },
    });

    const result = await runTool(spec, { q: "unique-retry-case" }, resolve);

    expect(calls).toBe(2);
    expect(result.output).toEqual({ answer: 7 });
    expect(result.trace).toHaveLength(2);
    expect(result.trace[0]).toMatchObject({ ok: false });
    expect(result.trace[1]).toMatchObject({ ok: true });
  });

  test("escalates to pro after flash exhausts its retries, and only calls pro once", async () => {
    const spec = makeSpec();
    let flashCalls = 0;
    let proCalls = 0;
    const resolve = (tier: Tier): LLMProvider => {
      if (tier === "flash") {
        return {
          provider: "gemini",
          model: "gemini-flash",
          generate: async () => {
            flashCalls++;
            return { text: "still not json", provider: "gemini", model: "gemini-flash" };
          },
        };
      }
      return {
        provider: "gemini",
        model: "gemini-pro",
        generate: async () => {
          proCalls++;
          return { text: '{"answer": 99}', provider: "gemini", model: "gemini-pro" };
        },
      };
    };

    const result = await runTool(spec, { q: "unique-escalation-case" }, resolve);

    expect(flashCalls).toBe(3); // 1 initial + 2 retries
    expect(proCalls).toBe(1);
    expect(result.output).toEqual({ answer: 99 });
    expect(result.fellBackToFixture).toBe(false);
    expect(result.trace).toHaveLength(4);
    expect(result.trace.at(-1)).toMatchObject({ tier: "pro", escalated: true, ok: true });
  });

  test("falls back to the fixture when both flash retries and the pro escalation fail", async () => {
    const spec = makeSpec();
    const resolve = (): LLMProvider => ({
      provider: "groq",
      model: "whatever",
      generate: async () => ({ text: "garbage", provider: "groq", model: "whatever" }),
    });

    const result = await runTool(spec, { q: "unique-fallback-case" }, resolve);

    expect(result.output).toEqual({ answer: -1 });
    expect(result.fellBackToFixture).toBe(true);
    expect(result.trace.at(-1)).toMatchObject({ provider: "fixture", ok: true });
  });

  test("falls back to the fixture, without throwing, when no provider is configured", async () => {
    const spec = makeSpec();
    const resolve = (): LLMProvider => {
      throw new Error("no api key");
    };

    const result = await runTool(spec, { q: "unique-no-provider-case" }, resolve);

    expect(result.output).toEqual({ answer: -1 });
    expect(result.fellBackToFixture).toBe(true);
  });

  test("caches by tool name and input, skipping the provider on a repeat call", async () => {
    const spec = makeSpec();
    let calls = 0;
    const resolve = (): LLMProvider => ({
      provider: "gemini",
      model: "gemini-flash",
      generate: async () => {
        calls++;
        return { text: '{"answer": 5}', provider: "gemini", model: "gemini-flash" };
      },
    });

    const input = { q: "unique-cache-case" };
    const first = await runTool(spec, input, resolve);
    const second = await runTool(spec, input, resolve);

    expect(calls).toBe(1);
    expect(second.output).toEqual(first.output);
    expect(second.trace[0]).toMatchObject({ cacheHit: true });
  });

  test("escalates when flash confidence is below the tool's threshold, even if the schema matches", async () => {
    const spec = makeSpec({ confidenceThreshold: 0.6 });
    let flashCalls = 0;
    let proCalls = 0;
    const resolve = (tier: Tier): LLMProvider => {
      if (tier === "flash") {
        return {
          provider: "gemini",
          model: "gemini-flash",
          generate: async () => {
            flashCalls++;
            return {
              text: '{"answer": 1, "confidence": 0.2}',
              provider: "gemini",
              model: "gemini-flash",
            };
          },
        };
      }
      return {
        provider: "gemini",
        model: "gemini-pro",
        generate: async () => {
          proCalls++;
          return {
            text: '{"answer": 8, "confidence": 0.9}',
            provider: "gemini",
            model: "gemini-pro",
          };
        },
      };
    };

    const result = await runTool(spec, { q: "unique-low-confidence-case" }, resolve);

    expect(flashCalls).toBe(3);
    expect(proCalls).toBe(1);
    expect(result.output).toEqual({ answer: 8 });
    expect(result.output).not.toHaveProperty("confidence");
    expect(result.trace[0]?.error).toContain("below threshold");
    expect(result.trace.at(-1)).toMatchObject({ tier: "pro", escalated: true, ok: true });
  });
});
