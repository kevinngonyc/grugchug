import { describe, expect, test } from "bun:test";
import { SPEECH_MAX_MS, SPEECH_MIN_MS, speechDuration } from "./duration";

describe("speechDuration", () => {
  test("never drops below the minimum", () => {
    expect(speechDuration("")).toBe(SPEECH_MIN_MS);
    expect(speechDuration("Hi")).toBe(SPEECH_MIN_MS);
  });

  test("grows with text length", () => {
    // 1500 base + 50 * 20 chars
    expect(speechDuration("x".repeat(20))).toBe(2500);
  });

  test("never exceeds the maximum", () => {
    expect(speechDuration("x".repeat(500))).toBe(SPEECH_MAX_MS);
  });
});
