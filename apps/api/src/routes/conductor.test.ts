// Offline: every dependency (tool runners, store) is a fake injected via
// each handler's deps parameter — no SQLite, no LLM calls.
import { describe, expect, test } from "bun:test";
import type { Question, RoutePlan } from "@grugchug/shared";
import { fixtureRoutePlan } from "../conductor/fixtures";
import type { ToolRunResult } from "../conductor/harness";
import type { EvaluateProgressOutput } from "../conductor/tools/evaluate-progress";
import type { GenerateQuestionsOutput } from "../conductor/tools/generate-questions";
import type { GradeShortOutput } from "../conductor/tools/grade-answer";
import type { PlanRouteOutput } from "../conductor/tools/plan-route";
import type { SetTimerOutput } from "../conductor/tools/set-timer";
import {
  answerStationWithDeps,
  askConductorWithDeps,
  createPlanWithDeps,
  type EvaluateProgressDeps,
  evaluateProgressWithDeps,
  getPlanWithDeps,
  setTimerWithDeps,
} from "./conductor";

const answerKeys = /correctIndex|rubric|referenceAnswer/;

function post(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function toolResult<T>(output: T): ToolRunResult<T> {
  return { output, trace: [], fellBackToFixture: false };
}

const skeletons: PlanRouteOutput["stations"] = [
  { id: "s1", index: 0, title: "One", scope: "First half", estimatedMinutes: 10 },
  { id: "s2", index: 1, title: "Two", scope: "Second half", estimatedMinutes: 10 },
];

function mcq(id: string): Question {
  return { id, type: "mcq", prompt: "p", choices: ["a", "b"], correctIndex: 0 };
}
function short(id: string): Question {
  return { id, type: "short", prompt: "p", rubric: "r", referenceAnswer: "a" };
}
function multi(id: string): Question {
  return { id, type: "multi", prompt: "p", choices: ["a", "b", "c"], correctIndices: [0, 1] };
}
const fourQuestions: Question[] = [mcq("q1"), mcq("q2"), mcq("q3"), short("q4")];

describe("createPlan", () => {
  test("assembles stations from plan-route and generate-questions, rewrites question ids, and saves", async () => {
    let saved: RoutePlan | undefined;
    const res = await createPlanWithDeps(
      post("/api/conductor/plans", {
        userId: "u1",
        availableMinutes: 20,
        materials: [{ kind: "text", text: "notes" }],
      }),
      {
        runPlanRoute: async () => toolResult<PlanRouteOutput>({ stations: skeletons }),
        runGenerateQuestions: async () =>
          toolResult<GenerateQuestionsOutput>({ questions: fourQuestions }),
        save: async (plan) => {
          saved = plan;
        },
      },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stations).toHaveLength(2);
    expect(body.stations[0].questions.map((q: { id: string }) => q.id)).toEqual([
      "s1-q1",
      "s1-q2",
      "s1-q3",
      "s1-q4",
    ]);
    expect(JSON.stringify(body)).not.toMatch(answerKeys);
    expect(saved?.stations).toHaveLength(2);
    expect(saved?.totalEstimatedMinutes).toBe(20);
  });

  test("builds one route from every uploaded material and hands them all to both tools", async () => {
    const materials = [
      { kind: "text" as const, text: "lecture one" },
      { kind: "text" as const, text: "lecture two" },
    ];
    let planRouteMaterials: unknown;
    let questionMaterials: unknown;
    let saved: RoutePlan | undefined;

    const res = await createPlanWithDeps(
      post("/api/conductor/plans", { userId: "u1", materials }),
      {
        runPlanRoute: async (input) => {
          planRouteMaterials = input.materials;
          return toolResult<PlanRouteOutput>({ stations: skeletons });
        },
        runGenerateQuestions: async (input) => {
          questionMaterials = input.materials;
          return toolResult<GenerateQuestionsOutput>({ questions: fourQuestions });
        },
        save: async (plan) => {
          saved = plan;
        },
      },
    );

    expect(res.status).toBe(200);
    expect(planRouteMaterials).toEqual(materials);
    expect(questionMaterials).toEqual(materials);
    // The hash covers the whole set, so dropping a file is different material.
    expect(saved?.materialHash).not.toBe("");
  });

  test("rejects a request with no materials at all", async () => {
    const res = await createPlanWithDeps(
      post("/api/conductor/plans", { userId: "u1", materials: [] }),
      {
        runPlanRoute: async () => {
          throw new Error("should not be called");
        },
        runGenerateQuestions: async () => {
          throw new Error("should not be called");
        },
        save: async () => {
          throw new Error("should not be called");
        },
      },
    );

    expect(res.status).toBe(400);
  });

  test("falls back to fixture questions for a station whose generation call throws, without failing the route", async () => {
    let calls = 0;
    const res = await createPlanWithDeps(
      post("/api/conductor/plans", {
        userId: "u1",
        availableMinutes: 20,
        materials: [{ kind: "text", text: "notes" }],
      }),
      {
        runPlanRoute: async () => toolResult<PlanRouteOutput>({ stations: skeletons }),
        runGenerateQuestions: async () => {
          calls++;
          if (calls === 1) throw new Error("boom");
          return toolResult<GenerateQuestionsOutput>({ questions: fourQuestions });
        },
        save: async () => {},
      },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.usedFallback).toBe(true);
    // Station 0 fell back: keeps its real id/title/scope, generic fixture questions.
    const fixtureFirstStation = fixtureRoutePlan.stations[0];
    if (!fixtureFirstStation) throw new Error("fixtureRoutePlan has no stations");
    expect(body.stations[0].id).toBe("s1");
    expect(body.stations[0].questions).toHaveLength(fixtureFirstStation.questions.length);
    // Station 1 used the real (fake) generated questions with rewritten ids.
    expect(body.stations[1].questions.map((q: { id: string }) => q.id)[0]).toBe("s2-q1");
  });

  test("returns 500 without saving a broken plan when the store fails", async () => {
    const res = await createPlanWithDeps(
      post("/api/conductor/plans", {
        userId: "u1",
        availableMinutes: 20,
        materials: [{ kind: "text", text: "notes" }],
      }),
      {
        runPlanRoute: async () => toolResult<PlanRouteOutput>({ stations: skeletons }),
        runGenerateQuestions: async () =>
          toolResult<GenerateQuestionsOutput>({ questions: fourQuestions }),
        save: async () => {
          throw new Error("database is down");
        },
      },
    );

    expect(res.status).toBe(500);
  });

  test("rejects a malformed body before calling any tool", async () => {
    const res = await createPlanWithDeps(post("/api/conductor/plans", { userId: "u1" }), {
      runPlanRoute: async () => {
        throw new Error("should not be called");
      },
      runGenerateQuestions: async () => {
        throw new Error("should not be called");
      },
      save: async () => {
        throw new Error("should not be called");
      },
    });
    expect(res.status).toBe(400);
  });
});

describe("getPlan", () => {
  const plan: RoutePlan = {
    id: "p1",
    userId: "u1",
    materialHash: "h",
    totalEstimatedMinutes: 10,
    stations: [
      {
        id: "s1",
        index: 0,
        title: "One",
        scope: "x",
        estimatedMinutes: 10,
        questions: fourQuestions,
      },
    ],
  };

  function withParams(id: string): Request & { params: { id: string } } {
    return Object.assign(new Request(`http://localhost/api/conductor/plans/${id}`), {
      params: { id },
    });
  }

  test("returns the plan without answer keys", async () => {
    const res = await getPlanWithDeps(withParams("p1"), { get: async () => plan });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(answerKeys);
  });

  test("404s when the plan does not exist", async () => {
    const res = await getPlanWithDeps(withParams("missing"), { get: async () => null });
    expect(res.status).toBe(404);
  });

  test("500s when the store throws", async () => {
    const res = await getPlanWithDeps(withParams("p1"), {
      get: async () => {
        throw new Error("database is down");
      },
    });
    expect(res.status).toBe(500);
  });
});

describe("answerStation", () => {
  const plan: RoutePlan = {
    id: "p1",
    userId: "u1",
    materialHash: "h",
    totalEstimatedMinutes: 10,
    stations: [
      {
        id: "s1",
        index: 0,
        title: "One",
        scope: "x",
        estimatedMinutes: 10,
        questions: [...fourQuestions, multi("q5")],
      },
    ],
  };

  function answer(body: unknown, gradeShort?: () => Promise<ToolRunResult<GradeShortOutput>>) {
    const req = post("/api/conductor/stations/s1/answer", body);
    return answerStationWithDeps(Object.assign(req, { params: { stationId: "s1" } }), {
      get: async () => plan,
      gradeShort:
        gradeShort ??
        (async () => toolResult<GradeShortOutput>({ score: 0, passed: false, feedback: "" })),
    });
  }

  test("grades mcq locally without calling gradeShort", async () => {
    let called = false;
    const res = await answer(
      { planId: "p1", questionId: "q1", answer: { type: "mcq", choiceIndex: 0 } },
      async () => {
        called = true;
        return toolResult<GradeShortOutput>({ score: 1, passed: true, feedback: "" });
      },
    );
    expect(await res.json()).toMatchObject({ score: 1, passed: true });
    expect(called).toBe(false);
  });

  test("grades multi locally without calling gradeShort", async () => {
    let called = false;
    const res = await answer(
      { planId: "p1", questionId: "q5", answer: { type: "multi", choiceIndices: [1, 0] } },
      async () => {
        called = true;
        return toolResult<GradeShortOutput>({ score: 1, passed: true, feedback: "" });
      },
    );
    expect(await res.json()).toMatchObject({ score: 1, passed: true });
    expect(called).toBe(false);
  });

  test("grades short answers via gradeShort", async () => {
    const res = await answer(
      { planId: "p1", questionId: "q4", answer: { type: "short", text: "my answer" } },
      async () => toolResult<GradeShortOutput>({ score: 0.8, passed: true, feedback: "Nice." }),
    );
    expect(await res.json()).toEqual({
      questionId: "q4",
      score: 0.8,
      passed: true,
      feedback: "Nice.",
    });
  });

  test("rejects a mismatched answer type", async () => {
    const res = await answer({
      planId: "p1",
      questionId: "q1",
      answer: { type: "short", text: "x" },
    });
    expect(res.status).toBe(400);
  });

  test("404s on an unknown question", async () => {
    const res = await answer({
      planId: "p1",
      questionId: "nope",
      answer: { type: "mcq", choiceIndex: 0 },
    });
    expect(res.status).toBe(404);
  });

  test("404s when the plan does not exist", async () => {
    const req = post("/api/conductor/stations/s1/answer", {
      planId: "missing",
      questionId: "q1",
      answer: { type: "mcq", choiceIndex: 0 },
    });
    const res = await answerStationWithDeps(Object.assign(req, { params: { stationId: "s1" } }), {
      get: async () => null,
      gradeShort: async () =>
        toolResult<GradeShortOutput>({ score: 0, passed: false, feedback: "" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("askConductor", () => {
  const plan: RoutePlan = {
    id: "p1",
    userId: "u1",
    materialHash: "h",
    totalEstimatedMinutes: 10,
    stations: [
      {
        id: "s1",
        index: 0,
        title: "One",
        scope: "station scope",
        estimatedMinutes: 10,
        questions: fourQuestions,
      },
    ],
  };

  test("answers using the resolved station's scope", async () => {
    let receivedScope: string | undefined;
    const res = await askConductorWithDeps(
      post("/api/conductor/ask", { planId: "p1", stationId: "s1", question: "why?" }),
      {
        get: async () => plan,
        runAsk: async (input) => {
          receivedScope = input.scope;
          return toolResult({ answer: "because" });
        },
      },
    );
    expect(await res.json()).toEqual({ answer: "because" });
    expect(receivedScope).toBe("station scope");
  });

  test("404s when the plan does not exist", async () => {
    const res = await askConductorWithDeps(
      post("/api/conductor/ask", { planId: "missing", question: "why?" }),
      {
        get: async () => null,
        runAsk: async () => toolResult({ answer: "n/a" }),
      },
    );
    expect(res.status).toBe(404);
  });
});

describe("setTimer", () => {
  const plan: RoutePlan = {
    id: "p1",
    userId: "u1",
    materialHash: "h",
    totalEstimatedMinutes: 10,
    stations: [
      {
        id: "s1",
        index: 0,
        title: "One",
        scope: "station scope",
        estimatedMinutes: 10,
        questions: fourQuestions,
      },
    ],
  };

  test("resolves the station's scope from stationId and returns the tool's output", async () => {
    let receivedInput: unknown;
    const res = await setTimerWithDeps(
      post("/api/conductor/timer", { planId: "p1", stationId: "s1", reason: "study" }),
      {
        get: async () => plan,
        runSetTimer: async (input) => {
          receivedInput = input;
          return toolResult<SetTimerOutput>({ minutes: 15, message: "Let's go." });
        },
      },
    );
    expect(await res.json()).toEqual({ minutes: 15, message: "Let's go." });
    expect(receivedInput).toEqual({
      reason: "study",
      scope: "station scope",
      previousMinutes: undefined,
    });
  });

  test("omits scope for a break with no stationId", async () => {
    let receivedInput: unknown;
    const res = await setTimerWithDeps(
      post("/api/conductor/timer", { planId: "p1", reason: "break", previousMinutes: 40 }),
      {
        get: async () => plan,
        runSetTimer: async (input) => {
          receivedInput = input;
          return toolResult<SetTimerOutput>({ minutes: 12, message: "Take a breather." });
        },
      },
    );
    expect(res.status).toBe(200);
    expect(receivedInput).toEqual({ reason: "break", scope: undefined, previousMinutes: 40 });
  });

  test("404s when the plan does not exist", async () => {
    const res = await setTimerWithDeps(
      post("/api/conductor/timer", { planId: "missing", reason: "study" }),
      {
        get: async () => null,
        runSetTimer: async () => toolResult<SetTimerOutput>({ minutes: 10, message: "x" }),
      },
    );
    expect(res.status).toBe(404);
  });
});

describe("evaluateProgress", () => {
  const plan: RoutePlan = {
    id: "p1",
    userId: "u1",
    materialHash: "h",
    totalEstimatedMinutes: 10,
    stations: [
      {
        id: "s1",
        index: 0,
        title: "One",
        scope: "station scope",
        estimatedMinutes: 10,
        questions: fourQuestions,
      },
    ],
  };

  function evaluate(body: unknown, runEvaluate?: EvaluateProgressDeps["runEvaluate"]) {
    const req = post("/api/conductor/stations/s1/evaluate", body);
    return evaluateProgressWithDeps(Object.assign(req, { params: { stationId: "s1" } }), {
      get: async () => plan,
      runEvaluate:
        runEvaluate ??
        (async () => toolResult<EvaluateProgressOutput>({ passed: true, feedback: "Nice work." })),
    });
  }

  test("passes the station scope and results through to the tool", async () => {
    let receivedInput: unknown;
    const results = [
      { questionId: "q1", prompt: "2+2?", answerGiven: "4", score: 1, feedback: "Correct." },
    ];
    const res = await evaluate({ planId: "p1", results }, async (input) => {
      receivedInput = input;
      return toolResult<EvaluateProgressOutput>({ passed: true, feedback: "Great." });
    });
    expect(await res.json()).toEqual({ passed: true, feedback: "Great." });
    expect(receivedInput).toEqual({ scope: "station scope", results });
  });

  test("rejects a result whose questionId is not in this station", async () => {
    const res = await evaluate({
      planId: "p1",
      results: [
        { questionId: "not-in-station", prompt: "x", answerGiven: "y", score: 1, feedback: "z" },
      ],
    });
    expect(res.status).toBe(400);
  });

  test("404s when the plan does not exist", async () => {
    const req = post("/api/conductor/stations/s1/evaluate", {
      planId: "missing",
      results: [{ questionId: "q1", prompt: "x", answerGiven: "y", score: 1, feedback: "z" }],
    });
    const res = await evaluateProgressWithDeps(
      Object.assign(req, { params: { stationId: "s1" } }),
      {
        get: async () => null,
        runEvaluate: async () =>
          toolResult<EvaluateProgressOutput>({ passed: false, feedback: "n/a" }),
      },
    );
    expect(res.status).toBe(404);
  });
});

test.each(["plan", "questions", "none"])(
  "marks persisted and public fallback provenance: %s",
  async (failure) => {
    let saved: RoutePlan | undefined;
    const response = await createPlanWithDeps(
      post("/api/conductor/plans", { userId: "u1", materials: [{ kind: "text", text: "notes" }] }),
      {
        runPlanRoute: async () => ({
          ...toolResult<PlanRouteOutput>({ stations: skeletons }),
          fellBackToFixture: failure === "plan",
        }),
        runGenerateQuestions: async () => ({
          ...toolResult<GenerateQuestionsOutput>({ questions: fourQuestions }),
          fellBackToFixture: failure === "questions",
        }),
        save: async (plan) => {
          saved = plan;
        },
      },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.usedFallback).toBe(failure !== "none");
    expect(saved?.usedFallback).toBe(failure !== "none");
    expect(JSON.stringify(body)).not.toMatch(answerKeys);
  },
);
