// Offline: every dependency (tool runners, store) is a fake injected via
// each handler's deps parameter — no SQLite, no LLM calls.
import { describe, expect, test } from "bun:test";
import type { Question, RoutePlan } from "@grugchug/shared";
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
  type RegenerateStationDeps,
  regenerateStationWithDeps,
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

    let savedMaterials: unknown;
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
        save: async (plan, stored) => {
          saved = plan;
          savedMaterials = stored;
        },
      },
    );

    expect(res.status).toBe(200);
    expect(planRouteMaterials).toEqual(materials);
    expect(questionMaterials).toEqual(materials);
    // Kept with the plan so the TA can answer from them later.
    expect(savedMaterials).toEqual(materials);
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

  // A fixture is sample content, not the learner's material: the route is
  // refused with the provider's reason rather than saved looking real.
  function fellBack<T>(output: T, error: string): ToolRunResult<T> {
    return {
      output,
      fellBackToFixture: true,
      trace: [
        {
          tool: "t",
          provider: "none",
          model: "none",
          tier: "flash",
          latencyMs: 0,
          attempt: 1,
          escalated: false,
          cacheHit: false,
          ok: false,
          error,
        },
      ],
    };
  }

  test("refuses with 503 and the reason when plan-route fell back to its fixture", async () => {
    let saved = false;
    const res = await createPlanWithDeps(
      post("/api/conductor/plans", { userId: "u1", materials: [{ kind: "text", text: "notes" }] }),
      {
        runPlanRoute: async () =>
          fellBack<PlanRouteOutput>(
            { stations: skeletons },
            "no provider available: GROQ_FLASH_MODEL is not set",
          ),
        runGenerateQuestions: async () => {
          throw new Error("should not be called");
        },
        save: async () => {
          saved = true;
        },
      },
    );

    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe(
      "AI provider unavailable: no provider available: GROQ_FLASH_MODEL is not set",
    );
    expect(saved).toBe(false);
  });

  test("refuses with 503 when any station's questions fell back or threw", async () => {
    for (const failure of ["fell back", "threw"] as const) {
      let saved = false;
      let calls = 0;
      const res = await createPlanWithDeps(
        post("/api/conductor/plans", {
          userId: "u1",
          materials: [{ kind: "text", text: "notes" }],
        }),
        {
          runPlanRoute: async () => toolResult<PlanRouteOutput>({ stations: skeletons }),
          runGenerateQuestions: async () => {
            calls++;
            if (calls === 2) {
              if (failure === "threw") throw new Error("boom");
              return fellBack<GenerateQuestionsOutput>({ questions: fourQuestions }, "quota");
            }
            return toolResult<GenerateQuestionsOutput>({ questions: fourQuestions });
          },
          save: async () => {
            saved = true;
          },
        },
      );

      expect(res.status).toBe(503);
      expect((await res.json()).error).toContain(failure === "threw" ? "boom" : "quota");
      expect(saved).toBe(false);
    }
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
        getMaterials: async () => null,
        runAsk: async (input) => {
          receivedScope = input.scope;
          return toolResult({ answer: "because" });
        },
      },
    );
    expect(await res.json()).toEqual({ answer: "because" });
    expect(receivedScope).toBe("station scope");
  });

  test("hands the TA the stored material and the conversation so far", async () => {
    const materials = [{ kind: "text" as const, text: "lecture one" }];
    const history = [{ question: "Name two pigments", answer: "Chlorophyll a and b." }];
    let received: unknown;
    await askConductorWithDeps(
      post("/api/conductor/ask", {
        planId: "p1",
        stationId: "s1",
        question: "and the second one?",
        history,
      }),
      {
        get: async () => plan,
        getMaterials: async (forPlan) => (forPlan.id === "p1" ? materials : null),
        runAsk: async (input) => {
          received = input;
          return toolResult({ answer: "b" });
        },
      },
    );
    expect(received).toEqual({
      scope: "station scope",
      question: "and the second one?",
      history,
      materials,
    });
  });

  test("a plan with no stored material still gets an answer from its scope", async () => {
    let received: { materials?: unknown } | undefined;
    const res = await askConductorWithDeps(
      post("/api/conductor/ask", { planId: "p1", question: "why?" }),
      {
        get: async () => plan,
        getMaterials: async () => {
          throw new Error("no such table");
        },
        runAsk: async (input) => {
          received = input;
          return toolResult({ answer: "because" });
        },
      },
    );
    expect(res.status).toBe(200);
    expect(received?.materials).toBeUndefined();
  });

  test("404s when the plan does not exist", async () => {
    const res = await askConductorWithDeps(
      post("/api/conductor/ask", { planId: "missing", question: "why?" }),
      {
        get: async () => null,
        getMaterials: async () => null,
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
        runEvaluate ?? (async () => toolResult<EvaluateProgressOutput>({ feedback: "Nice work." })),
    });
  }

  function resultsScoring(...scores: number[]) {
    return scores.map((score, i) => ({
      questionId: ["q1", "q2", "q3", "q4"][i] ?? "q1",
      prompt: `Q${i + 1}`,
      answerGiven: "a",
      score,
      feedback: "f",
    }));
  }

  test("hands the tool the scope, results, and the verdict it must explain", async () => {
    let receivedInput: unknown;
    const results = [
      { questionId: "q1", prompt: "2+2?", answerGiven: "4", score: 1, feedback: "Correct." },
    ];
    const res = await evaluate({ planId: "p1", results }, async (input) => {
      receivedInput = input;
      return toolResult<EvaluateProgressOutput>({ feedback: "Great." });
    });
    expect(await res.json()).toEqual({ passed: true, feedback: "Great." });
    expect(receivedInput).toEqual({ scope: "station scope", results, passed: true, meanScore: 1 });
  });

  test("passes at exactly 70% overall and fails just under it, whatever the model says", async () => {
    const atMark = await evaluate({ planId: "p1", results: resultsScoring(1, 1, 0.8, 0) });
    expect((await atMark.json()).passed).toBe(true);

    const under = await evaluate({ planId: "p1", results: resultsScoring(1, 1, 0.76, 0) });
    expect((await under.json()).passed).toBe(false);
  });

  test("decides on the whole percent the learner sees, so 69.5% is the 70% it reads as", async () => {
    // Otherwise the panel would show "70% overall (pass mark 70%)" beside
    // "not passed", and the feedback prompt would tell the model the same.
    const rounded = await evaluate({ planId: "p1", results: resultsScoring(1, 1, 0.78, 0) });
    expect((await rounded.json()).passed).toBe(true);
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
        runEvaluate: async () => toolResult<EvaluateProgressOutput>({ feedback: "n/a" }),
      },
    );
    expect(res.status).toBe(404);
  });
});

describe("regenerateStation", () => {
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
        scope: "first half",
        estimatedMinutes: 10,
        questions: fourQuestions,
      },
      {
        id: "s2",
        index: 1,
        title: "Two",
        scope: "second half",
        estimatedMinutes: 10,
        questions: fourQuestions,
      },
    ],
  };
  const materials = [{ kind: "text" as const, text: "lecture one" }];
  const freshQuestions: Question[] = [mcq("new1"), mcq("new2"), mcq("new3"), short("new4")];

  function regenerate(
    stationId: string,
    body: unknown,
    overrides: Partial<RegenerateStationDeps> = {},
  ) {
    const req = post(`/api/conductor/stations/${stationId}/regenerate`, body);
    return regenerateStationWithDeps(Object.assign(req, { params: { stationId } }), {
      get: async () => plan,
      getMaterials: async () => materials,
      runGenerateQuestions: async () =>
        toolResult<GenerateQuestionsOutput>({ questions: freshQuestions }),
      save: async () => {},
      ...overrides,
    });
  }

  test("replaces the station's questions with a fresh set from the stored material, and persists it", async () => {
    let saved: RoutePlan | undefined;
    const res = await regenerate(
      "s1",
      { planId: "p1" },
      {
        save: async (p) => {
          saved = p;
        },
      },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("s1");
    expect(body.questions.map((q: { id: string }) => q.id)).toEqual([
      "s1-q1",
      "s1-q2",
      "s1-q3",
      "s1-q4",
    ]);
    expect(JSON.stringify(body)).not.toMatch(answerKeys);
    // Persisted in place: the other station, and everything else, untouched.
    expect(saved?.stations[0]?.questions.map((q) => q.id)).toEqual([
      "s1-q1",
      "s1-q2",
      "s1-q3",
      "s1-q4",
    ]);
    expect(saved?.stations[1]).toEqual(plan.stations[1]);
  });

  test("422s when the plan has no stored material to regenerate from", async () => {
    const res = await regenerate("s1", { planId: "p1" }, { getMaterials: async () => null });
    expect(res.status).toBe(422);
  });

  test("refuses with 503 when generation falls back, and saves nothing", async () => {
    let saved = false;
    const res = await regenerate(
      "s1",
      { planId: "p1" },
      {
        runGenerateQuestions: async () => ({
          ...toolResult<GenerateQuestionsOutput>({ questions: freshQuestions }),
          fellBackToFixture: true,
          trace: [
            {
              tool: "generate-questions",
              provider: "none",
              model: "none",
              tier: "flash",
              latencyMs: 0,
              attempt: 1,
              escalated: false,
              cacheHit: false,
              ok: false,
              error: "GROQ_FLASH_MODEL is not set",
            },
          ],
        }),
        save: async () => {
          saved = true;
        },
      },
    );
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("GROQ_FLASH_MODEL is not set");
    expect(saved).toBe(false);
  });

  test("404s on an unknown station", async () => {
    const res = await regenerate("nope", { planId: "p1" });
    expect(res.status).toBe(404);
  });

  test("404s when the plan does not exist", async () => {
    const res = await regenerate("s1", { planId: "missing" }, { get: async () => null });
    expect(res.status).toBe(404);
  });
});

// Sample content never becomes a route: a fixture in either phase is a 503
// with nothing saved, and a real route carries no fallback mark at all.
test.each(["plan", "questions", "none"])(
  "never persists or returns fallback content: %s",
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
    const body = await response.json();
    if (failure === "none") {
      expect(response.status).toBe(200);
      expect("usedFallback" in body).toBe(false);
      expect(saved).toBeDefined();
      expect(JSON.stringify(body)).not.toMatch(answerKeys);
    } else {
      expect(response.status).toBe(503);
      expect(body.error).toStartWith("AI provider unavailable:");
      expect(saved).toBeUndefined();
    }
  },
);
