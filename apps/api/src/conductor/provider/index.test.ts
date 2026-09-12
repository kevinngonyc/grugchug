import { afterEach, describe, expect, test } from "bun:test";
import { GeminiProvider } from "./gemini";
import { GroqProvider } from "./groq";
import { describeLlmConfig, getProvider } from "./index";

const keys = [
  "LLM_PROVIDER",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "GEMINI_FLASH_MODEL",
  "GEMINI_PRO_MODEL",
  "GROQ_FLASH_MODEL",
  "GROQ_PRO_MODEL",
] as const;
const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of keys) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("getProvider", () => {
  test("defaults to gemini and reads the tier-specific model", () => {
    delete process.env.LLM_PROVIDER;
    process.env.GEMINI_API_KEY = "fake";
    process.env.GEMINI_FLASH_MODEL = "flash-model-x";
    process.env.GEMINI_PRO_MODEL = "pro-model-y";

    const flash = getProvider("flash");
    const pro = getProvider("pro");

    expect(flash).toBeInstanceOf(GeminiProvider);
    expect(flash.model).toBe("flash-model-x");
    expect(pro.model).toBe("pro-model-y");
  });

  test("switches to groq when LLM_PROVIDER=groq", () => {
    process.env.LLM_PROVIDER = "groq";
    process.env.GROQ_API_KEY = "fake";
    process.env.GROQ_FLASH_MODEL = "groq-flash-model";

    const flash = getProvider("flash");

    expect(flash).toBeInstanceOf(GroqProvider);
    expect(flash.model).toBe("groq-flash-model");
  });

  test("throws when the required env var is missing, rather than guessing a model", () => {
    delete process.env.LLM_PROVIDER;
    process.env.GEMINI_API_KEY = "fake";
    delete process.env.GEMINI_FLASH_MODEL;

    expect(() => getProvider("flash")).toThrow(/GEMINI_FLASH_MODEL/);
  });
});

describe("describeLlmConfig", () => {
  test("names the vendor and models, and the key only by length", () => {
    const line = describeLlmConfig({
      LLM_PROVIDER: "groq",
      GROQ_API_KEY: "secret-key-123",
      GROQ_FLASH_MODEL: "flash-m",
      GROQ_PRO_MODEL: "pro-m",
    });
    expect(line).toBe("conductor LLM: groq · flash=flash-m · pro=pro-m · GROQ_API_KEY length 14");
    expect(line).not.toContain("secret-key-123");
  });

  test("calls out an unset provider and anything missing", () => {
    const line = describeLlmConfig({ GROQ_API_KEY: "k", GEMINI_FLASH_MODEL: "f" });
    expect(line).toContain("gemini (LLM_PROVIDER unset, defaulting to gemini)");
    expect(line).toContain("pro=(missing)");
    expect(line).toContain("GEMINI_API_KEY (missing)");
  });

  test("calls out an LLM_PROVIDER it does not recognise", () => {
    expect(describeLlmConfig({ LLM_PROVIDER: "Groq " })).toContain(
      'LLM_PROVIDER="Groq" not recognised',
    );
  });
});
