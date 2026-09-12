import { describe, expect, test } from "bun:test";
import {
  evaluateProgressRequestSchema,
  materialSchema,
  publicRoutePlanSchema,
  publicStationSchema,
  questionSchema,
  type Station,
  setTimerRequestSchema,
  setTimerResponseSchema,
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

  const multi = {
    id: "q",
    type: "multi" as const,
    prompt: "Select every pigment",
    choices: ["Chlorophyll a", "Chlorophyll b", "Carotenoid", "Starch"],
    correctIndices: [0, 1, 2],
  };

  test("accepts a select-all-that-apply question", () => {
    expect(questionSchema.safeParse(multi).success).toBe(true);
  });

  test("rejects a multi question with only one correct choice", () => {
    const result = questionSchema.safeParse({ ...multi, correctIndices: [0] });
    expect(result.success).toBe(false);
  });

  test("rejects a multi question where every choice is correct", () => {
    const result = questionSchema.safeParse({ ...multi, correctIndices: [0, 1, 2, 3] });
    expect(result.success).toBe(false);
  });

  test("rejects a multi question with a correctIndices entry outside choices", () => {
    const result = questionSchema.safeParse({ ...multi, correctIndices: [0, 9] });
    expect(result.success).toBe(false);
  });

  test("rejects duplicate entries in correctIndices", () => {
    const result = questionSchema.safeParse({ ...multi, correctIndices: [0, 0] });
    expect(result.success).toBe(false);
  });
});

describe("publicQuestionSchema", () => {
  test("strips correctIndices from a multi question", () => {
    const multi = {
      id: "q",
      type: "multi" as const,
      prompt: "Select every pigment",
      choices: ["Chlorophyll a", "Chlorophyll b", "Carotenoid", "Starch"],
      correctIndices: [0, 1, 2],
    };
    const pub = publicStationSchema.parse({ ...station, questions: [multi] }).questions[0];
    expect(pub).toEqual({
      id: "q",
      type: "multi",
      prompt: "Select every pigment",
      choices: ["Chlorophyll a", "Chlorophyll b", "Carotenoid", "Starch"],
    });
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

describe("setTimerRequestSchema", () => {
  test("accepts a break request with no stationId", () => {
    const result = setTimerRequestSchema.safeParse({
      planId: "p1",
      reason: "break",
      previousMinutes: 40,
    });
    expect(result.success).toBe(true);
  });

  test("rejects an unknown reason", () => {
    const result = setTimerRequestSchema.safeParse({ planId: "p1", reason: "nap" });
    expect(result.success).toBe(false);
  });
});

describe("setTimerResponseSchema", () => {
  test("rejects a minutes value over the sanity cap", () => {
    const result = setTimerResponseSchema.safeParse({ minutes: 500, message: "ok" });
    expect(result.success).toBe(false);
  });
});

describe("evaluateProgressRequestSchema", () => {
  test("rejects an empty results array", () => {
    const result = evaluateProgressRequestSchema.safeParse({ planId: "p1", results: [] });
    expect(result.success).toBe(false);
  });

  test("accepts one or more results", () => {
    const result = evaluateProgressRequestSchema.safeParse({
      planId: "p1",
      results: [
        { questionId: "q1", prompt: "p", answerGiven: "a", score: 1, feedback: "Correct." },
      ],
    });
    expect(result.success).toBe(true);
  });
});
