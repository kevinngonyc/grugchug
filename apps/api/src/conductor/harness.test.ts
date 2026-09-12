// Offline: every provider here is a fake in-memory function, no network.
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { fallbackReason, runTool, type ToolSpec } from "./harness";
import type { GenerateOptions, LLMProvider, ProviderPart, Tier } from "./provider";

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
    system: "You are a test tool.",
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

  test("after the primary vendor is exhausted, tries the next vendor before the fixture", async () => {
    const spec = makeSpec();
    const seen: Array<{ vendor?: string; tier: Tier }> = [];
    const resolve = (tier: Tier, vendor?: string): LLMProvider => {
      seen.push({ vendor, tier });
      if (vendor === "groq" && tier === "flash") {
        return fakeProvider("groq", "groq-flash", '{"answer": 11}');
      }
      return {
        provider: vendor === "groq" ? "groq" : "gemini",
        model: `${vendor ?? "gemini"}-${tier}`,
        generate: async () => ({
          text: "garbage",
          provider: vendor === "groq" ? "groq" : "gemini",
          model: `${vendor ?? "gemini"}-${tier}`,
        }),
      };
    };

    const result = await runTool(spec, { q: "unique-vendor-fallback-case" }, resolve, [
      "gemini",
      "groq",
    ]);

    expect(result.output).toEqual({ answer: 11 });
    expect(result.fellBackToFixture).toBe(false);
    expect(seen.filter((c) => c.vendor === "gemini")).toHaveLength(4);
    expect(seen.some((c) => c.vendor === "groq" && c.tier === "flash")).toBe(true);
    expect(result.trace.at(-1)).toMatchObject({ provider: "groq", tier: "flash", ok: true });
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

  test("sends the tool's system instruction and temperature with the request", async () => {
    const spec = makeSpec({ temperature: 0.2 });
    const seen: Array<GenerateOptions | undefined> = [];
    const resolve = (): LLMProvider => ({
      provider: "gemini",
      model: "gemini-flash",
      generate: async (_parts, options) => {
        seen.push(options);
        return { text: '{"answer": 3}', provider: "gemini", model: "gemini-flash" };
      },
    });

    await runTool(spec, { q: "unique-system-case" }, resolve);

    expect(seen).toEqual([{ system: "You are a test tool.", temperature: 0.2 }]);
  });

  test("a tool that opts out of caching asks the provider every time", async () => {
    const spec = makeSpec({ cache: false });
    let calls = 0;
    const resolve = (): LLMProvider => ({
      provider: "gemini",
      model: "gemini-flash",
      generate: async () => {
        calls++;
        return { text: '{"answer": 5}', provider: "gemini", model: "gemini-flash" };
      },
    });

    const input = { q: "unique-no-cache-case" };
    await runTool(spec, input, resolve);
    const second = await runTool(spec, input, resolve);

    expect(calls).toBe(2);
    expect(second.trace[0]).toMatchObject({ cacheHit: false });
  });

  test("fallbackReason names the first failure, and is null for a real answer", async () => {
    const failed = await runTool(makeSpec(), { q: "unique-reason-case" }, () => {
      throw new Error("GROQ_FLASH_MODEL is not set");
    });
    expect(fallbackReason(failed)).toBe("no provider available: GROQ_FLASH_MODEL is not set");

    const ok = await runTool(makeSpec(), { q: "unique-reason-ok-case" }, () =>
      fakeProvider("gemini", "gemini-flash", '{"answer": 1}'),
    );
    expect(fallbackReason(ok)).toBeNull();
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

  test("falls back to the fixture when the pro escalation's confidence is also below threshold", async () => {
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
          // Even the bigger model isn't sure — no further escalation exists,
          // so this must fall back to the fixture, not loop or throw.
          return {
            text: '{"answer": 8, "confidence": 0.3}',
            provider: "gemini",
            model: "gemini-pro",
          };
        },
      };
    };

    const result = await runTool(spec, { q: "unique-low-confidence-pro-too-case" }, resolve);

    expect(flashCalls).toBe(3);
    expect(proCalls).toBe(1);
    expect(result.fellBackToFixture).toBe(true);
    expect(result.output).toEqual({ answer: -1 });
    expect(result.trace.at(-1)).toMatchObject({ provider: "fixture", ok: true });
    expect(result.trace.at(-2)).toMatchObject({
      tier: "pro",
      escalated: true,
      ok: false,
      error: expect.stringContaining("below threshold"),
    });
  });
});
