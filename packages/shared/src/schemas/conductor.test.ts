import { describe, expect, test } from "bun:test";
import {
  materialSchema,
  publicRoutePlanSchema,
  publicStationSchema,
  questionSchema,
  type Station,
  stationSchema,
} from "./conductor";

const station: Station = {
  id: "st-1",
  index: 0,
  title: "Pigments",
  scope: "Chlorophyll and light absorption.",
  estimatedMinutes: 8,
  questions: [
    {
      id: "q1",
      type: "mcq",
      prompt: "Which colour does chlorophyll reflect?",
      choices: ["Red", "Green", "Blue"],
      correctIndex: 1,
    },
    {
      id: "q2",
      type: "short",
      prompt: "Why are leaves green?",
      rubric: "Mentions that green light is reflected.",
      referenceAnswer: "Chlorophyll absorbs red and blue light and reflects green.",
    },
  ],
};

const answerKeys = /correctIndex|rubric|referenceAnswer/;

describe("stationSchema", () => {
  test("accepts a station with both question types", () => {
    expect(stationSchema.parse(station)).toEqual(station);
  });
});

describe("publicStationSchema", () => {
  test("strips answer keys from every question", () => {
    const pub = publicStationSchema.parse(station);
    expect(JSON.stringify(pub)).not.toMatch(answerKeys);
    expect(pub.questions[0]).toEqual({
      id: "q1",
      type: "mcq",
      prompt: "Which colour does chlorophyll reflect?",
      choices: ["Red", "Green", "Blue"],
    });
  });

  test("strips answer keys through a whole route plan", () => {
    const pub = publicRoutePlanSchema.parse({
      id: "p1",
      userId: "u1",
      materialHash: "h",
      totalEstimatedMinutes: 8,
      stations: [station],
    });
    expect(JSON.stringify(pub)).not.toMatch(answerKeys);
  });
});

describe("questionSchema", () => {
  test("rejects an mcq whose correctIndex is outside choices", () => {
    const result = questionSchema.safeParse({
      id: "q",
      type: "mcq",
      prompt: "Pick one",
      choices: ["a", "b"],
      correctIndex: 2,
    });
    expect(result.success).toBe(false);
  });

  test("rejects a short answer without a rubric", () => {
    const result = questionSchema.safeParse({
      id: "q",
      type: "short",
      prompt: "Explain",
      referenceAnswer: "Because.",
    });
    expect(result.success).toBe(false);
  });
});

describe("materialSchema", () => {
  test("accepts text and base64 pdf", () => {
    expect(materialSchema.safeParse({ kind: "text", text: "notes" }).success).toBe(true);
    expect(materialSchema.safeParse({ kind: "pdf", base64: "JVBERi0xLjQK" }).success).toBe(true);
  });

  test("rejects a pdf that is not base64", () => {
    expect(materialSchema.safeParse({ kind: "pdf", base64: "not base64!" }).success).toBe(false);
  });
});
