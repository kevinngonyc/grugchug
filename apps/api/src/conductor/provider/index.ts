// The one place that decides which vendor and model serve a call. Nothing
// else in the conductor should read LLM_PROVIDER or a *_MODEL env var, or
// construct a GeminiProvider/GroqProvider directly.
import { GeminiProvider } from "./gemini";
import { GroqProvider } from "./groq";
import type { LLMProvider } from "./types";

export type Tier = "flash" | "pro";
export type Vendor = "gemini" | "groq";

type Env = Record<string, string | undefined>;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function envPrefix(vendor: Vendor): "GEMINI" | "GROQ" {
  return vendor === "groq" ? "GROQ" : "GEMINI";
}

export function primaryVendor(env: Env = process.env): Vendor {
  return env.LLM_PROVIDER === "groq" ? "groq" : "gemini";
}

export function vendorReady(vendor: Vendor, env: Env = process.env): boolean {
  const prefix = envPrefix(vendor);
  return Boolean(
    env[`${prefix}_API_KEY`]?.trim() &&
      env[`${prefix}_FLASH_MODEL`]?.trim() &&
      env[`${prefix}_PRO_MODEL`]?.trim(),
  );
}

// Primary first; the other vendor only if its key and both models are set.
export function vendorsToTry(env: Env = process.env): Vendor[] {
  const primary = primaryVendor(env);
  const other: Vendor = primary === "gemini" ? "groq" : "gemini";
  return vendorReady(other, env) ? [primary, other] : [primary];
}

export function getProvider(tier: Tier, vendor: Vendor = primaryVendor()): LLMProvider {
  if (vendor === "groq") {
    const model = requireEnv(tier === "flash" ? "GROQ_FLASH_MODEL" : "GROQ_PRO_MODEL");
    return new GroqProvider(model, requireEnv("GROQ_API_KEY"));
  }
  const model = requireEnv(tier === "flash" ? "GEMINI_FLASH_MODEL" : "GEMINI_PRO_MODEL");
  return new GeminiProvider(model, requireEnv("GEMINI_API_KEY"));
}

// One line saying which vendor and models calls will use and whether a key
// is present, logged at startup. A missing model or key otherwise only shows
// up as failed calls. The key is reported by length, never by value.
export function describeLlmConfig(env: Env = process.env): string {
  const vendor = primaryVendor(env);
  const prefix = envPrefix(vendor);
  const provider = env.LLM_PROVIDER?.trim();
  const note = !provider
    ? " (LLM_PROVIDER unset, defaulting to gemini)"
    : provider !== vendor
      ? ` (LLM_PROVIDER="${provider}" not recognised, defaulting to gemini)`
      : "";
  const model = (name: string) => env[name]?.trim() || "(missing)";
  const key = env[`${prefix}_API_KEY`]?.trim();
  const other: Vendor = vendor === "gemini" ? "groq" : "gemini";
  const parts = [
    `conductor LLM: ${vendor}${note}`,
    `flash=${model(`${prefix}_FLASH_MODEL`)}`,
    `pro=${model(`${prefix}_PRO_MODEL`)}`,
    `${prefix}_API_KEY ${key ? `length ${key.length}` : "(missing)"}`,
  ];
  if (vendorReady(other, env)) parts.push(`fallback=${other}`);
  return parts.join(" · ");
}

export type { GenerateOptions, LLMProvider, ProviderPart, ProviderResult } from "./types";
