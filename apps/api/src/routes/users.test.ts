import { describe, expect, test } from "bun:test";
import { openDatabase } from "../db";
import { sqliteUserRepo } from "../users-repo";
import { createUserRoutes } from "./users";

const repo = (now?: () => string) => sqliteUserRepo(openDatabase(":memory:"), now);

const put = (id: string, body: BodyInit) =>
  new Request(`http://test/api/users/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body,
  });

const json = (body: unknown) => JSON.stringify(body);

describe("users routes", () => {
  test("GET on a missing user is 404", async () => {
    const users = createUserRoutes(repo());
    const res = await users.get("u1");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "user not found" });
  });

  test.each(["", "x".repeat(65)])(
    "GET rejects an invalid id before reading the repo (%j)",
    async (id) => {
      const r = repo();
      await r.upsert(id, { name: "You", avatar: "poku" });
      const users = createUserRoutes(r);
      const res = await users.get(id);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "invalid user id",
        detail: "must be 1 to 64 characters",
      });
    },
  );

  test.each(["", "x".repeat(65)])(
    "PUT rejects an invalid id and stores nothing (%j)",
    async (id) => {
      const r = repo();
      const users = createUserRoutes(r);
      const res = await users.put(id, put(id, json({ name: "You", avatar: "poku" })));
      expect(res.status).toBe(400);
      expect(await r.get(id)).toBeNull();
    },
  );

  test("a 64-character id can be saved and fetched", async () => {
    const users = createUserRoutes(repo());
    const id = "x".repeat(64);
    expect((await users.put(id, put(id, json({ name: "You", avatar: "poku" })))).status).toBe(200);
    expect((await users.get(id)).status).toBe(200);
  });

  test("PUT creates the user and GET returns it", async () => {
    const users = createUserRoutes(repo(() => "2026-09-11T00:00:00.000Z"));
    const created = await users.put("u1", put("u1", json({ name: "You", avatar: "conductor" })));
    expect(created.status).toBe(200);
    const expected = {
      id: "u1",
      name: "You",
      avatar: "conductor",
      createdAt: "2026-09-11T00:00:00.000Z",
    };
    expect(await created.json()).toEqual(expected);
    const fetched = await users.get("u1");
    expect(fetched.status).toBe(200);
    expect(await fetched.json()).toEqual(expected);
  });

  test("PUT with an unknown avatar is 400 and stores nothing", async () => {
    const users = createUserRoutes(repo());
    const res = await users.put("u1", put("u1", json({ name: "You", avatar: "dragon" })));
    expect(res.status).toBe(400);
    expect((await users.get("u1")).status).toBe(404);
  });

  test("PUT with a body that is not JSON is 400", async () => {
    const users = createUserRoutes(repo());
    const res = await users.put("u1", put("u1", "not json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid profile", detail: "body must be JSON" });
  });

  test("a second PUT updates the profile but keeps createdAt", async () => {
    let tick = 0;
    const users = createUserRoutes(repo(() => `2026-09-11T00:00:0${tick++}.000Z`));
    await users.put("u1", put("u1", json({ name: "You", avatar: "poku" })));
    const res = await users.put("u1", put("u1", json({ name: "Ada", avatar: "bonbon" })));
    expect(await res.json()).toEqual({
      id: "u1",
      name: "Ada",
      avatar: "bonbon",
      createdAt: "2026-09-11T00:00:00.000Z",
    });
  });
});
