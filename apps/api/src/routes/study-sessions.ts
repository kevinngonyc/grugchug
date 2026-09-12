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
import {
  endStudySession,
  getStudySession,
  listStudySessions,
  recordStationResult,
  startStudySession,
} from "../study/store";
import { callerId, problem, readBody } from "./http";

export function createStudySessionRoutes(db: Database) {
  return {
    async create(req: Request): Promise<Response> {
      const body = await readBody(req, startStudySessionRequestSchema);
      if (!body.ok) return body.response;
      if (!callerId(req)) return problem(401, "unauthorized");
      if (callerId(req) !== body.data.userId) return problem(403, "forbidden");
      return Response.json(await startStudySession(body.data, db));
    },

    async record(id: string, req: Request): Promise<Response> {
      const userId = callerId(req);
      if (!userId) return problem(401, "unauthorized");
      const owned = await getStudySession(id, db);
      if (!owned || owned.userId !== userId) return problem(404, "study session not found");
      const body = await readBody(req, stationResultRequestSchema);
      if (!body.ok) return body.response;
      const result = await recordStationResult(id, body.data, db);
      return result ? Response.json(result) : problem(404, "study session not found");
    },

    async end(id: string, req: Request): Promise<Response> {
      const userId = callerId(req);
      if (!userId) return problem(401, "unauthorized");
      const owned = await getStudySession(id, db);
      if (!owned || owned.userId !== userId) return problem(404, "study session not found");
      const body = await readBody(req, endStudySessionRequestSchema);
      if (!body.ok) return body.response;
      const session = await endStudySession(id, body.data.outcome, db);
      return session ? Response.json(session) : problem(404, "study session not found");
    },

    async list(req: Request): Promise<Response> {
      const userId = userIdSchema.safeParse(new URL(req.url).searchParams.get("userId") ?? "");
      if (!userId.success)
        return problem(400, "invalid user id", "userId query parameter required");
      if (!callerId(req)) return problem(401, "unauthorized");
      if (callerId(req) !== userId.data) return problem(403, "forbidden");
      return Response.json(await listStudySessions(userId.data, db));
    },
  };
}
