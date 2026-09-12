import { userProfileSchema } from "@grugchug/shared";
import type { UserRepo } from "../users-repo";

// GET reads a user; PUT upserts name and avatar. Identity is whatever id the
// browser minted for itself: there is no auth yet. Handlers take the id
// directly so tests need no BunRequest; index.ts unpacks req.params.
export function createUserRoutes(repo: UserRepo) {
  return {
    async get(id: string): Promise<Response> {
      const user = await repo.get(id);
      if (!user) return Response.json({ error: "not found" }, { status: 404 });
      return Response.json(user);
    },

    async put(id: string, req: Request): Promise<Response> {
      const body: unknown = await req.json().catch(() => undefined);
      const parsed = userProfileSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: "invalid profile" }, { status: 400 });
      return Response.json(await repo.upsert(id, parsed.data));
    },
  };
}
