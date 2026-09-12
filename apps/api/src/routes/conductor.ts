// Conductor HTTP handlers: build a route from study material, serve it, grade
// answers, and field questions mid-study. Phase 1 is a mock: every endpoint
// answers from the fixture route plan and never calls an LLM or MongoDB.
import {
  answerResultSchema,
  answerSubmissionSchema,
  askRequestSchema,
  askResponseSchema,
  createPlanRequestSchema,
  publicRoutePlanSchema,
} from "@grugchug/shared";
import type { z } from "zod";
import { fixtureRoutePlan } from "../conductor/fixtures";

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

// POST /api/conductor/plans
export async function createPlan(req: Request): Promise<Response> {
  const body = await readBody(req, createPlanRequestSchema);
  if (!body.ok) return body.response;
  const plan = { ...fixtureRoutePlan, userId: body.data.userId };
  return Response.json(publicRoutePlanSchema.parse(plan));
}

// GET /api/conductor/plans/:id. The mock returns the fixture for any id.
export function getPlan(): Response {
  return Response.json(publicRoutePlanSchema.parse(fixtureRoutePlan));
}

// POST /api/conductor/stations/:stationId/answer
export async function answerStation(req: WithParams<"stationId">): Promise<Response> {
  const body = await readBody(req, answerSubmissionSchema);
  if (!body.ok) return body.response;
  const { questionId, answer } = body.data;

  const station = fixtureRoutePlan.stations.find((s) => s.id === req.params.stationId);
  if (!station) return Response.json({ error: "station not found" }, { status: 404 });
  const question = station.questions.find((q) => q.id === questionId);
  if (!question) return Response.json({ error: "question not found" }, { status: 404 });

  if (question.type === "mcq" && answer.type === "mcq") {
    const passed = answer.choiceIndex === question.correctIndex;
    return Response.json(
      answerResultSchema.parse({
        questionId,
        score: passed ? 1 : 0,
        passed,
        feedback: passed ? "Correct." : "Not quite. Review this station and try again.",
      }),
    );
  }
  if (question.type === "short" && answer.type === "short") {
    const passed = answer.text.trim().length > 0;
    return Response.json(
      answerResultSchema.parse({
        questionId,
        score: passed ? 1 : 0,
        passed,
        feedback: passed
          ? "Mock grading: any non-empty answer passes until the real grader lands."
          : "Write an answer before submitting.",
      }),
    );
  }
  return Response.json({ error: "answer type does not match question type" }, { status: 400 });
}

// POST /api/conductor/ask
export async function askConductor(req: Request): Promise<Response> {
  const body = await readBody(req, askRequestSchema);
  if (!body.ok) return body.response;
  const station = fixtureRoutePlan.stations.find((s) => s.id === body.data.stationId);
  const where = station ? ` about "${station.title}"` : "";
  return Response.json(
    askResponseSchema.parse({
      answer: `Mock conductor: I got your question${where}. Real answers arrive once the LLM is wired in.`,
    }),
  );
}
