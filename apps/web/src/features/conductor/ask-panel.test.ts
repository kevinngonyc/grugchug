import { describe, expect, test } from "bun:test";
import {
  askTurnSchema,
  MAX_ASK_ANSWER_CHARS,
  MAX_ASK_HISTORY,
  type PublicRoutePlan,
} from "@grugchug/shared";
import { askHistory, askStationId } from "./ask-panel";

describe("askHistory", () => {
  const answered = (n: number, answer = `answer ${n}`) => ({
    id: `e${n}`,
    question: `question ${n}`,
    answer,
  });

  test("sends the last few answered exchanges and skips one still being answered", () => {
    const entries = [answered(1), { id: "pending", question: "waiting", answer: null }, answered(2)];
    expect(askHistory(entries)).toEqual([
      { question: "question 1", answer: "answer 1" },
      { question: "question 2", answer: "answer 2" },
    ]);
    const many = Array.from({ length: MAX_ASK_HISTORY + 3 }, (_, i) => answered(i));
    expect(askHistory(many)).toHaveLength(MAX_ASK_HISTORY);
    expect(askHistory(many).at(-1)?.question).toBe(`question ${MAX_ASK_HISTORY + 2}`);
  });

  test("an answer longer than the server accepts is trimmed, so follow-ups keep working", () => {
    // The TA's own answer is unbounded; echoed back whole, one long answer
    // would make every later question fail validation until the panel reset.
    const long = "x".repeat(MAX_ASK_ANSWER_CHARS + 500);
    const [turn] = askHistory([answered(1, long)]);
    expect(turn?.answer).toHaveLength(MAX_ASK_ANSWER_CHARS);
    expect(askTurnSchema.safeParse(turn).success).toBe(true);
  });
});

const plan: PublicRoutePlan = {
  id: "plan-1",
  userId: "u1",
  materialHash: "h",
  totalEstimatedMinutes: 20,
  stations: [
    {
      id: "s1",
      index: 0,
      title: "One",
      scope: "first",
      estimatedMinutes: 10,
      questions: [],
    },
    {
      id: "s2",
      index: 1,
      title: "Two",
      scope: "second",
      estimatedMinutes: 10,
      questions: [],
    },
  ],
};

describe("askStationId", () => {
  test("omits stationId before studying starts", () => {
    expect(askStationId(plan, 0, "idle")).toBeUndefined();
  });

  test("passes the current station once a session is underway", () => {
    expect(askStationId(plan, 0, "counting")).toBe("s1");
    expect(askStationId(plan, 1, "at-station")).toBe("s2");
  });

  test("omits stationId when there is no plan", () => {
    expect(askStationId(null, 0, "counting")).toBeUndefined();
  });
});
