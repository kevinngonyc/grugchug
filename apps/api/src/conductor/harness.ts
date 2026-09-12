// The core of the conductor: runs one "tool" (a prompt + a zod-validated
// shape) against an LLM, with retries, escalation to a bigger model, a
// content-hash cache, a timeout, and a trace log. Every failure mode
// degrades to a caller-supplied fixture instead of throwing — a request
// should never die just because both providers are down or unconfigured.
// Callers that must not pass a fixture off as real content check
// fallbackReason() and refuse instead (see routes/conductor.ts createPlan).
import type { z } from "zod";
import {
  getProvider,
  type LLMProvider,
  type ProviderPart,
  type Tier,
  type Vendor,
  vendorsToTry,
} from "./provider";

// Same material + same params should not re-hit the LLM. Keyed on tool name
// plus the validated input, JSON-stringified. Process-lifetime only, and
// bounded: past this many entries the oldest is dropped.
const MAX_CACHE_ENTRIES = 200;
const cache = new Map<string, { output: unknown; trace: TraceEntry }>();

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_FLASH_RETRIES = 2;
/** Phase 4: generate-questions and grade-answer ask the model for this; below it, escalate. */
export const CONFIDENCE_THRESHOLD = 0.6;

export interface ToolSpec<TInput, TOutput> {
  name: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  /**
   * Who the model is for this tool and the standing rules it keeps. Sent as
   * the vendor's system instruction, apart from the per-call data prompt()
   * builds.
   */
  system: string;
  /** Sampling temperature. Omit for the vendor default. */
  temperature?: number;
  /** Builds the model request from validated input. May include a document part for PDFs. */
  prompt(input: TInput): ProviderPart[];
  /** Used only when every vendor attempt (flash retries + one pro escalation) has failed. */
  fixture(input: TInput): TOutput;
  /** Per-call timeout override. Defaults to DEFAULT_TIMEOUT_MS. */
  timeoutMs?: number;
  /**
   * When set, the model's JSON must include `confidence` in [0, 1] at least
   * this high. Missing or low confidence fails the attempt (retry, then
   * escalate) the same way a schema miss does. The field is stripped before
   * the output is cached or returned — it never leaves the harness.
   */
  confidenceThreshold?: number;
  /**
   * false for a tool whose answer should vary call to call — set-timer's
   * message would otherwise repeat word for word. Default: cached.
   */
  cache?: boolean;
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
export type ProviderResolver = (tier: Tier, vendor?: Vendor) => LLMProvider;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Every failed attempt and every fixture fallback is printed, so a
// misconfigured provider is visible in the API's output rather than only as
// odd content in the app. Quiet under `bun test`, where failures are the
// point of half the tests.
function warn(message: string): void {
  if (process.env.NODE_ENV !== "test") console.warn(`[conductor] ${message}`);
}

function remember(key: string, value: { output: unknown; trace: TraceEntry }): void {
  cache.set(key, value);
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
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

/**
 * Why a run fell back to its fixture — the first attempt's error, which is
 * the most specific ("GROQ_FLASH_MODEL is not set") — or null if it did not.
 */
export function fallbackReason(result: ToolRunResult<unknown>): string | null {
  if (!result.fellBackToFixture) return null;
  return result.trace.find((entry) => !entry.ok)?.error ?? "every attempt failed";
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
    const result = await withTimeout(
      provider.generate(parts, { system: spec.system, temperature: spec.temperature }),
      timeoutMs,
    );
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

    if (spec.confidenceThreshold !== undefined) {
      const raw =
        parsed !== null && typeof parsed === "object" && "confidence" in parsed
          ? (parsed as { confidence: unknown }).confidence
          : undefined;
      if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 1) {
        return {
          ok: false,
          trace: {
            ...base,
            latencyMs,
            cacheHit: false,
            ok: false,
            error: "missing or invalid confidence (need a number from 0 to 1)",
          },
        };
      }
      if (raw < spec.confidenceThreshold) {
        return {
          ok: false,
          trace: {
            ...base,
            latencyMs,
            cacheHit: false,
            ok: false,
            error: `confidence ${raw} is below threshold ${spec.confidenceThreshold}`,
          },
        };
      }
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
  warn(`${spec.name}: every attempt failed, serving its fixture (${reason})`);
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

function warnFailed(entry: TraceEntry): void {
  warn(
    `${entry.tool}: ${entry.tier} attempt ${entry.attempt} failed (${entry.provider}/${entry.model}): ${entry.error}`,
  );
}

type BoundResolver = (tier: Tier) => LLMProvider;

async function tryVendor<TInput, TOutput>(
  spec: ToolSpec<TInput, TOutput>,
  resolve: BoundResolver,
  basePrompt: ProviderPart[],
  timeoutMs: number,
  trace: TraceEntry[],
): Promise<{ ok: true; output: TOutput } | { ok: false; error: string }> {
  let lastError: string | undefined;
  for (let attempt = 1; attempt <= MAX_FLASH_RETRIES + 1; attempt++) {
    const parts =
      attempt === 1 || lastError === undefined
        ? basePrompt
        : [...basePrompt, feedbackPart(lastError)];
    const result = await attemptOnce(resolve, spec, parts, timeoutMs, "flash", attempt, false);
    trace.push(result.trace);
    if (result.ok) return { ok: true, output: result.output };
    warnFailed(result.trace);
    lastError = result.trace.error;
  }

  const escalation = await attemptOnce(resolve, spec, basePrompt, timeoutMs, "pro", 1, true);
  trace.push(escalation.trace);
  if (escalation.ok) return { ok: true, output: escalation.output };
  warnFailed(escalation.trace);
  return { ok: false, error: escalation.trace.error ?? "escalation failed" };
}

// The testable core: everything above minus how a provider is obtained.
// defineTool()'s run() calls this with the real getProvider; tests pass a
// fake resolver instead so nothing hits the network. `vendors` defaults to
// the primary only so offline tests do not pick up a second vendor from
// whoever's .env; production passes vendorsToTry().
export async function runTool<TInput, TOutput>(
  spec: ToolSpec<TInput, TOutput>,
  rawInput: TInput,
  resolveProvider: ProviderResolver,
  vendors: readonly Vendor[] = ["gemini"],
): Promise<ToolRunResult<TOutput>> {
  const input = spec.inputSchema.parse(rawInput);
  const useCache = spec.cache !== false;
  const cacheKey = hashKey(spec.name, input);
  const cached = useCache ? cache.get(cacheKey) : undefined;
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
  let lastError = "every attempt failed";

  for (let i = 0; i < vendors.length; i++) {
    const vendor = vendors[i];
    if (vendor === undefined) continue;
    if (i > 0) warn(`${spec.name}: ${vendors[i - 1]} exhausted, trying ${vendor}`);
    const outcome = await tryVendor(
      spec,
      (tier) => resolveProvider(tier, vendor),
      basePrompt,
      timeoutMs,
      trace,
    );
    if (outcome.ok) {
      const last = trace[trace.length - 1];
      if (useCache && last) remember(cacheKey, { output: outcome.output, trace: last });
      return { output: outcome.output, trace, fellBackToFixture: false };
    }
    lastError = outcome.error;
  }

  return fallback(spec, input, trace, "pro", lastError);
}

export function defineTool<TInput, TOutput>(
  spec: ToolSpec<TInput, TOutput>,
): Tool<TInput, TOutput> {
  return {
    ...spec,
    run: (input) => runTool(spec, input, getProvider, vendorsToTry()),
  };
}
