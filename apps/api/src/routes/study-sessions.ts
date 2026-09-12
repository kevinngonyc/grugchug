// Study history: start a run through a route, record each station's verdict,
// end it, and list a user's runs for the dashboard. Handlers take ids directly
// so tests need no BunRequest; index.ts unpacks req.params.
import type { Database } from "bun:sqlite";
import {
  endStudySessionRequestSchema,
  startStudySessionRequestSchema,
  stationResultRequestSchema,
  userIdSchema,
} from "@grugchug/shared";
import type { z } from "zod";
import {
  endStudySession,
  listStudySessions,
  recordStationResult,
  startStudySession,
} from "../study/store";

function problem(status: number, error: string, detail?: string): Response {
  return Response.json({ error, ...(detail === undefined ? {} : { detail }) }, { status });
}

async function readBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ ok: true; data: z.output<S> } | { ok: false; response: Response }> {
  const body: unknown = await req.json().catch(() => undefined);
  if (body === undefined)
    return { ok: false, response: problem(400, "invalid body", "body must be JSON") };
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, response: problem(400, "invalid body", parsed.error.issues[0]?.message) };
  }
  return { ok: true, data: parsed.data };
}

export function createStudySessionRoutes(db: Database) {
  return {
    async create(req: Request): Promise<Response> {
      const body = await readBody(req, startStudySessionRequestSchema);
      if (!body.ok) return body.response;
      return Response.json(await startStudySession(body.data, db));
    },

    async record(id: string, req: Request): Promise<Response> {
      const body = await readBody(req, stationResultRequestSchema);
      if (!body.ok) return body.response;
      const result = await recordStationResult(id, body.data, db);
      return result ? Response.json(result) : problem(404, "study session not found");
    },

    async end(id: string, req: Request): Promise<Response> {
      const body = await readBody(req, endStudySessionRequestSchema);
      if (!body.ok) return body.response;
      const session = await endStudySession(id, body.data.outcome, db);
      return session ? Response.json(session) : problem(404, "study session not found");
    },

    async list(req: Request): Promise<Response> {
      const userId = userIdSchema.safeParse(new URL(req.url).searchParams.get("userId") ?? "");
      if (!userId.success)
        return problem(400, "invalid user id", "userId query parameter required");
      return Response.json(await listStudySessions(userId.data, db));
    },
  };
}
