import { describe, expect, test } from "bun:test";
import { gazeSampleSchema } from "./gaze";

describe("gazeSampleSchema", () => {
  test("accepts a normalized sample", () => {
    const sample = { sessionId: "s1", t: 12.5, x: 0.4, y: 0.9, onScreen: true };
    expect(gazeSampleSchema.parse(sample)).toEqual(sample);
  });

  test("rejects coordinates outside the viewport", () => {
    const result = gazeSampleSchema.safeParse({
      sessionId: "s1",
      t: 0,
      x: 1.2,
      y: 0.5,
      onScreen: true,
    });
    expect(result.success).toBe(false);
  });
});
