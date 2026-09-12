// The core of the conductor: runs one "tool" (a prompt + a zod-validated
// shape) against an LLM, with retries, escalation to a bigger model, a
// content-hash cache, a timeout, and a trace log. Every failure mode
// degrades to a caller-supplied fixture instead of throwing — a request
// should never die just because both providers are down or unconfigured.
import type { z } from "zod";
import { getProvider, type LLMProvider, type ProviderPart, type Tier } from "./provider";

// Same material + same params should not re-hit the LLM. Keyed on tool name
// plus the validated input, JSON-stringified. Process-lifetime only.
const cache = new Map<string, { output: unknown; trace: TraceEntry }>();

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_FLASH_RETRIES = 2;

export interface ToolSpec<TInput, TOutput> {
  name: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  /** Builds the model request from validated input. May include a document part for PDFs. */
  prompt(input: TInput): ProviderPart[];
  /** Used only when every provider attempt (flash retries + one pro escalation) has failed. */
  fixture(input: TInput): TOutput;
  /** Per-call timeout override. Defaults to DEFAULT_TIMEOUT_MS. */
  timeoutMs?: number;
}

export interface TraceEntry {
  tool: string;
  /** "gemini" | "groq" | "fixture" (fixture only appears on the final fallback entry). */
  provider: string;
  model: string;
  tier: Tier;
  latencyMs: number;
  attempt: number;
  escalated: boolean;
  cacheHit: boolean;
  ok: boolean;
  error?: string;
}

export interface ToolRunResult<TOutput> {
  output: TOutput;
  trace: TraceEntry[];
  fellBackToFixture: boolean;
}

export interface Tool<TInput, TOutput> extends ToolSpec<TInput, TOutput> {
  run(input: TInput): Promise<ToolRunResult<TOutput>>;
}

// Resolves a provider for a tier. A real dependency in production
// (provider/index.ts's getProvider), swappable in tests for a fake that
// never touches the network.
export type ProviderResolver = (tier: Tier) => LLMProvider;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class TimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(`timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function hashKey(toolName: string, input: unknown): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(toolName);
  hasher.update(JSON.stringify(input));
  return hasher.digest("hex");
}

function feedbackPart(error: string): ProviderPart {
  return {
    kind: "text",
    text: `Your previous response failed validation with this error: ${error}\nRespond again with corrected JSON only, matching the requested shape exactly.`,
  };
}

type Attempt<TOutput> =
  | { ok: true; output: TOutput; trace: TraceEntry }
  | { ok: false; trace: TraceEntry };

async function attemptOnce<TInput, TOutput>(
  resolveProvider: ProviderResolver,
  spec: ToolSpec<TInput, TOutput>,
  parts: ProviderPart[],
  timeoutMs: number,
  tier: Tier,
  attempt: number,
  escalated: boolean,
): Promise<Attempt<TOutput>> {
  const started = performance.now();

  let provider: LLMProvider;
  try {
    provider = resolveProvider(tier);
  } catch (error) {
    return {
      ok: false,
      trace: {
        tool: spec.name,
        provider: "none",
        model: "none",
        tier,
        latencyMs: 0,
        attempt,
        escalated,
        cacheHit: false,
        ok: false,
        error: `no provider available: ${describeError(error)}`,
      },
    };
  }

  const base = {
    tool: spec.name,
    provider: provider.provider,
    model: provider.model,
    tier,
    attempt,
    escalated,
  };

  try {
    const result = await withTimeout(provider.generate(parts), timeoutMs);
    const latencyMs = Math.round(performance.now() - started);

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.text);
    } catch (error) {
      return {
        ok: false,
        trace: {
          ...base,
          latencyMs,
          cacheHit: false,
          ok: false,
          error: `response was not valid JSON: ${describeError(error)}`,
        },
      };
    }

    const validated = spec.outputSchema.safeParse(parsed);
    if (!validated.success) {
      return {
        ok: false,
        trace: { ...base, latencyMs, cacheHit: false, ok: false, error: validated.error.message },
      };
    }

    return {
      ok: true,
      output: validated.data,
      trace: { ...base, latencyMs, cacheHit: false, ok: true },
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - started);
    return {
      ok: false,
      trace: { ...base, latencyMs, cacheHit: false, ok: false, error: describeError(error) },
    };
  }
}

function fallback<TInput, TOutput>(
  spec: ToolSpec<TInput, TOutput>,
  input: TInput,
  trace: TraceEntry[],
  tier: Tier,
  reason: string,
): ToolRunResult<TOutput> {
  trace.push({
    tool: spec.name,
    provider: "fixture",
    model: "fixture",
    tier,
    latencyMs: 0,
    attempt: trace.length + 1,
    escalated: false,
    cacheHit: false,
    ok: true,
    error: reason,
  });
  return { output: spec.fixture(input), trace, fellBackToFixture: true };
}

// The testable core: everything above minus how a provider is obtained.
// defineTool()'s run() calls this with the real getProvider; tests pass a
// fake resolver instead so nothing hits the network.
export async function runTool<TInput, TOutput>(
  spec: ToolSpec<TInput, TOutput>,
  rawInput: TInput,
  resolveProvider: ProviderResolver,
): Promise<ToolRunResult<TOutput>> {
  const input = spec.inputSchema.parse(rawInput);
  const cacheKey = hashKey(spec.name, input);
  const cached = cache.get(cacheKey);
  if (cached) {
    return {
      output: cached.output as TOutput,
      trace: [{ ...cached.trace, cacheHit: true, latencyMs: 0 }],
      fellBackToFixture: false,
    };
  }

  const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const basePrompt = spec.prompt(input);
  const trace: TraceEntry[] = [];

  let lastError: string | undefined;
  for (let attempt = 1; attempt <= MAX_FLASH_RETRIES + 1; attempt++) {
    const parts =
      attempt === 1 || lastError === undefined
        ? basePrompt
        : [...basePrompt, feedbackPart(lastError)];
    const result = await attemptOnce(
      resolveProvider,
      spec,
      parts,
      timeoutMs,
      "flash",
      attempt,
      false,
    );
    trace.push(result.trace);
    if (result.ok) {
      cache.set(cacheKey, { output: result.output, trace: result.trace });
      return { output: result.output, trace, fellBackToFixture: false };
    }
    lastError = result.trace.error;
  }

  // One escalation to the pro tier of the same tool. No further retries, no
  // further escalation past this.
  const escalation = await attemptOnce(
    resolveProvider,
    spec,
    basePrompt,
    timeoutMs,
    "pro",
    1,
    true,
  );
  trace.push(escalation.trace);
  if (escalation.ok) {
    cache.set(cacheKey, { output: escalation.output, trace: escalation.trace });
    return { output: escalation.output, trace, fellBackToFixture: false };
  }

  return fallback(spec, input, trace, "pro", escalation.trace.error ?? "escalation failed");
}

export function defineTool<TInput, TOutput>(
  spec: ToolSpec<TInput, TOutput>,
): Tool<TInput, TOutput> {
  return {
    ...spec,
    run: (input) => runTool(spec, input, getProvider),
  };
}
