import { userIdSchema, userProfileSchema } from "@grugchug/shared";
import type { UserRepo } from "../users-repo";

import { problem, readBody } from "./http";

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
      const parsed = await readBody(req, userProfileSchema, "invalid profile");
      if (!parsed.ok) return parsed.response;
      return Response.json(await repo.upsert(parsedId.data, parsed.data));
    },
  };
}
