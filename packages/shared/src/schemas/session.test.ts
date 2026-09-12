import { describe, expect, test } from "bun:test";
import {
  endStudySessionRequestSchema,
  startStudySessionRequestSchema,
  stationResultRequestSchema,
  studySessionSchema,
  studySessionSummarySchema,
} from "./session";

const session = {
  id: "s1",
  userId: "u1",
  planId: "p1",
  stationTotal: 4,
  startedAt: "2026-09-12T10:00:00.000Z",
  endedAt: null,
  outcome: null,
};

describe("study session schemas", () => {
  test("accepts an open session", () => {
    expect(studySessionSchema.parse(session)).toEqual(session);
  });

  test("accepts a completed summary", () => {
    const summary = {
      ...session,
      endedAt: "2026-09-12T10:40:00.000Z",
      outcome: "completed" as const,
      stationsPassed: 4,
    };
    expect(studySessionSummarySchema.parse(summary)).toEqual(summary);
  });

  test("rejects an unknown outcome", () => {
    expect(endStudySessionRequestSchema.safeParse({ outcome: "abandoned" }).success).toBe(false);
  });

  test("start needs a positive station total", () => {
    expect(
      startStudySessionRequestSchema.safeParse({ userId: "u", planId: "p", stationTotal: 0 })
        .success,
    ).toBe(false);
  });

  test("a station result keeps the score in 0..1", () => {
    const ok = { stationIndex: 0, stationId: "st", passed: true, meanScore: 0.75 };
    expect(stationResultRequestSchema.parse(ok)).toEqual(ok);
    expect(stationResultRequestSchema.safeParse({ ...ok, meanScore: 1.5 }).success).toBe(false);
  });
});
