import { CHAT_USER_HEADER, userIdSchema } from "@grugchug/shared";
import type { z } from "zod";

export function callerId(req: Request): string | null {
  const parsed = userIdSchema.safeParse(req.headers.get(CHAT_USER_HEADER) ?? "");
  return parsed.success ? parsed.data : null;
}

export function problem(status: number, error: string, detail?: string): Response {
  return Response.json({ error, ...(detail === undefined ? {} : { detail }) }, { status });
}

export async function readBody<S extends z.ZodType>(
  req: Request,
  schema: S,
  error = "invalid body",
  includeIssues = false,
): Promise<{ ok: true; data: z.output<S> } | { ok: false; response: Response }> {
  const body: unknown = await req.json().catch(() => undefined);
  if (body === undefined)
    return {
      ok: false,
      response: includeIssues
        ? problem(400, "body must be JSON")
        : problem(400, error, "body must be JSON"),
    };
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: includeIssues
        ? Response.json({ error, issues: parsed.error.issues }, { status: 400 })
        : problem(400, error, parsed.error.issues[0]?.message),
    };
  }
  return { ok: true, data: parsed.data };
}
