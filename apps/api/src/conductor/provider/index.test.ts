import { afterEach, describe, expect, test } from "bun:test";
import { GeminiProvider } from "./gemini";
import { GroqProvider } from "./groq";
import { getProvider } from "./index";

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
