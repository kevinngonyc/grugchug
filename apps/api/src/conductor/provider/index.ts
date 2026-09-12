// The one place that decides which vendor and model serve a call. Nothing
// else in the conductor should read LLM_PROVIDER or a *_MODEL env var, or
// construct a GeminiProvider/GroqProvider directly.
import { GeminiProvider } from "./gemini";
import { GroqProvider } from "./groq";
import type { LLMProvider } from "./types";

export type Tier = "flash" | "pro";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function getProvider(tier: Tier): LLMProvider {
  const vendor = process.env.LLM_PROVIDER === "groq" ? "groq" : "gemini";
  if (vendor === "groq") {
    const model = requireEnv(tier === "flash" ? "GROQ_FLASH_MODEL" : "GROQ_PRO_MODEL");
    return new GroqProvider(model, requireEnv("GROQ_API_KEY"));
  }
  const model = requireEnv(tier === "flash" ? "GEMINI_FLASH_MODEL" : "GEMINI_PRO_MODEL");
  return new GeminiProvider(model, requireEnv("GEMINI_API_KEY"));
}

export type { LLMProvider, ProviderPart, ProviderResult } from "./types";
