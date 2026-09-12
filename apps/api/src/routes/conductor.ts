// Conductor HTTP handlers: build a route from study material, serve it,
// grade answers, and field questions mid-study.
//
// createPlan runs two phases: plan-route breaks the material into stations,
// then generate-questions runs per station in parallel. Neither tool ever
// throws (the harness degrades to its own fixture internally); a station
// whose generation call still fails outright falls back to fixture
// questions here, so one bad station never fails the whole route. The
// assembled plan is persisted, and every other endpoint reads it back.
//
// Each handler takes its real dependencies (tool runners, store functions)
// as a defaulted parameter, so tests can inject fakes and stay offline —
// no MongoDB, no LLM calls — while production code (index.ts) gets the
// real ones for free.
import {
  type AnswerResult,
  answerResultSchema,
  answerSubmissionSchema,
  askRequestSchema,
  askResponseSchema,
  createPlanRequestSchema,
  type Material,
  publicRoutePlanSchema,
  type Question,
  type RoutePlan,
  type Station,
} from "@grugchug/shared";
import type { z } from "zod";
import { fixtureRoutePlan } from "../conductor/fixtures";
import { getRoutePlanById, saveRoutePlan } from "../conductor/store";
import { askConductorTool } from "../conductor/tools/ask-conductor";
import { generateQuestionsTool } from "../conductor/tools/generate-questions";
import { gradeMcq, gradeShortAnswerTool } from "../conductor/tools/grade-answer";
import type { StationSkeleton } from "../conductor/tools/plan-route";
import { planRouteTool } from "../conductor/tools/plan-route";

type WithParams<P extends string> = Request & { params: Record<P, string> };

type BodyResult<T> = { ok: true; data: T } | { ok: false; response: Response };

async function readBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<BodyResult<z.output<S>>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { ok: false, response: Response.json({ error: "body must be JSON" }, { status: 400 }) };
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    return {
      ok: false,
      response: Response.json(
        { error: "invalid body", issues: result.error.issues },
        { status: 400 },
      ),
    };
  }
  return { ok: true, data: result.data };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function materialHash(material: Material): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(material.kind === "text" ? material.text : material.base64);
  return hasher.digest("hex");
}

// Used only when generate-questions fails outright for a station (the
// harness's own fixture fallback means this is a last resort). The
// station's real id/title/scope from plan-route are kept; only the
// questions are generic filler.
function fixtureQuestionsFor(index: number): Question[] {
  const station = fixtureRoutePlan.stations[index % fixtureRoutePlan.stations.length];
  if (!station) throw new Error("fixtureRoutePlan has no stations");
  return station.questions;
}

export interface CreatePlanDeps {
  runPlanRoute: typeof planRouteTool.run;
  runGenerateQuestions: typeof generateQuestionsTool.run;
  save: typeof saveRoutePlan;
}

const defaultCreatePlanDeps: CreatePlanDeps = {
  runPlanRoute: planRouteTool.run,
  runGenerateQuestions: generateQuestionsTool.run,
  save: saveRoutePlan,
};

async function buildStation(
  skeleton: StationSkeleton,
  material: Material,
  index: number,
  runGenerateQuestions: CreatePlanDeps["runGenerateQuestions"],
): Promise<Station> {
  try {
    const result = await runGenerateQuestions({ scope: skeleton.scope, material });
    return {
      ...skeleton,
      questions: result.output.questions.map((q, qi) => ({
        ...q,
        id: `${skeleton.id}-q${qi + 1}`,
      })),
    };
  } catch {
    return { ...skeleton, questions: fixtureQuestionsFor(index) };
  }
}

// The real logic, parameterized over its dependencies so tests can inject
// fakes. Bun's route table requires a handler of a fixed (req) => Response
// shape, so createPlan below is the one-argument wrapper actually mounted.
export async function createPlanWithDeps(req: Request, deps: CreatePlanDeps): Promise<Response> {
  const body = await readBody(req, createPlanRequestSchema);
  if (!body.ok) return body.response;
  const { userId, availableMinutes, material } = body.data;

  const planResult = await deps.runPlanRoute({ material, availableMinutes });
  const stations = await Promise.all(
    planResult.output.stations.map((skeleton, i) =>
      buildStation(skeleton, material, i, deps.runGenerateQuestions),
    ),
  );

  const plan: RoutePlan = {
    id: crypto.randomUUID(),
    userId,
    materialHash: materialHash(material),
    totalEstimatedMinutes: stations.reduce((sum, s) => sum + s.estimatedMinutes, 0),
    stations,
  };

  try {
    await deps.save(plan);
  } catch (error) {
    return Response.json(
      { error: `failed to save route plan: ${describeError(error)}` },
      { status: 500 },
    );
  }

  return Response.json(publicRoutePlanSchema.parse(plan));
}

// POST /api/conductor/plans
export function createPlan(req: Request): Promise<Response> {
  return createPlanWithDeps(req, defaultCreatePlanDeps);
}

export interface PlanLookupDeps {
  get: typeof getRoutePlanById;
}

const defaultPlanLookupDeps: PlanLookupDeps = { get: getRoutePlanById };

async function loadPlan(
  id: string,
  get: PlanLookupDeps["get"],
): Promise<{ ok: true; plan: RoutePlan } | { ok: false; response: Response }> {
  let plan: RoutePlan | null;
  try {
    plan = await get(id);
  } catch (error) {
    return {
      ok: false,
      response: Response.json(
        { error: `failed to load route plan: ${describeError(error)}` },
        { status: 500 },
      ),
    };
  }
  if (!plan)
    return {
      ok: false,
      response: Response.json({ error: "route plan not found" }, { status: 404 }),
    };
  return { ok: true, plan };
}

export async function getPlanWithDeps(
  req: WithParams<"id">,
  deps: PlanLookupDeps,
): Promise<Response> {
  const found = await loadPlan(req.params.id, deps.get);
  if (!found.ok) return found.response;
  return Response.json(publicRoutePlanSchema.parse(found.plan));
}

// GET /api/conductor/plans/:id
export function getPlan(req: WithParams<"id">): Promise<Response> {
  return getPlanWithDeps(req, defaultPlanLookupDeps);
}

export interface AnswerStationDeps extends PlanLookupDeps {
  gradeShort: typeof gradeShortAnswerTool.run;
}

const defaultAnswerStationDeps: AnswerStationDeps = {
  get: getRoutePlanById,
  gradeShort: gradeShortAnswerTool.run,
};

export async function answerStationWithDeps(
  req: WithParams<"stationId">,
  deps: AnswerStationDeps,
): Promise<Response> {
  const body = await readBody(req, answerSubmissionSchema);
  if (!body.ok) return body.response;
  const { planId, questionId, answer } = body.data;

  const found = await loadPlan(planId, deps.get);
  if (!found.ok) return found.response;

  const station = found.plan.stations.find((s) => s.id === req.params.stationId);
  if (!station) return Response.json({ error: "station not found" }, { status: 404 });
  const question = station.questions.find((q) => q.id === questionId);
  if (!question) return Response.json({ error: "question not found" }, { status: 404 });

  let result: AnswerResult;
  if (question.type === "mcq" && answer.type === "mcq") {
    result = gradeMcq(question, answer.choiceIndex);
  } else if (question.type === "short" && answer.type === "short") {
    const graded = await deps.gradeShort({
      rubric: question.rubric,
      referenceAnswer: question.referenceAnswer,
      studentAnswer: answer.text,
    });
    result = { questionId, ...graded.output };
  } else {
    return Response.json({ error: "answer type does not match question type" }, { status: 400 });
  }
  return Response.json(answerResultSchema.parse(result));
}

// POST /api/conductor/stations/:stationId/answer
export function answerStation(req: WithParams<"stationId">): Promise<Response> {
  return answerStationWithDeps(req, defaultAnswerStationDeps);
}

export interface AskConductorDeps extends PlanLookupDeps {
  runAsk: typeof askConductorTool.run;
}

const defaultAskConductorDeps: AskConductorDeps = {
  get: getRoutePlanById,
  runAsk: askConductorTool.run,
};

export async function askConductorWithDeps(
  req: Request,
  deps: AskConductorDeps,
): Promise<Response> {
  const body = await readBody(req, askRequestSchema);
  if (!body.ok) return body.response;
  const { planId, stationId, question } = body.data;

  const found = await loadPlan(planId, deps.get);
  if (!found.ok) return found.response;

  const station = stationId ? found.plan.stations.find((s) => s.id === stationId) : undefined;
  const scope = station?.scope ?? found.plan.stations.map((s) => s.scope).join("\n");

  const result = await deps.runAsk({ scope, question });
  return Response.json(askResponseSchema.parse(result.output));
}

// POST /api/conductor/ask
export function askConductor(req: Request): Promise<Response> {
  return askConductorWithDeps(req, defaultAskConductorDeps);
}
