import { userIdSchema, userProfileSchema } from "@grugchug/shared";
import type { UserRepo } from "../users-repo";

function problem(status: number, error: string, detail?: string): Response {
  return Response.json({ error, ...(detail === undefined ? {} : { detail }) }, { status });
}

// GET reads a user; PUT upserts name and avatar. Identity is a browser-minted
// id bounded to 1–64 characters by the shared schema; there is no auth yet.
// Handlers take the id directly so tests need no BunRequest; index.ts unpacks
// req.params.
export function createUserRoutes(repo: UserRepo) {
  return {
    async get(id: string): Promise<Response> {
      const parsedId = userIdSchema.safeParse(id);
      if (!parsedId.success) return problem(400, "invalid user id", "must be 1 to 64 characters");
      const user = await repo.get(parsedId.data);
      if (!user) return problem(404, "user not found");
      return Response.json(user);
    },

    async put(id: string, req: Request): Promise<Response> {
      const parsedId = userIdSchema.safeParse(id);
      if (!parsedId.success) return problem(400, "invalid user id", "must be 1 to 64 characters");
      const body: unknown = await req.json().catch(() => undefined);
      if (body === undefined) return problem(400, "invalid profile", "body must be JSON");
      const parsed = userProfileSchema.safeParse(body);
      if (!parsed.success) return problem(400, "invalid profile", parsed.error.issues[0]?.message);
      return Response.json(await repo.upsert(parsedId.data, parsed.data));
    },
  };
}
