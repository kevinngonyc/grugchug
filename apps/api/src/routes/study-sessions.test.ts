import { describe, expect, test } from "bun:test";
import { openDatabase } from "../db";
import { createStudySessionRoutes } from "./study-sessions";

const json = (body: unknown, method = "POST") =>
  new Request("http://test/api/study-sessions", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const start = { userId: "u1", planId: "p1", stationTotal: 2 };

describe("study session routes", () => {
  test("start, record, end, list", async () => {
    const routes = createStudySessionRoutes(openDatabase(":memory:"));
    const created = await routes.create(json(start));
    expect(created.status).toBe(200);
    const session = (await created.json()) as { id: string };

    const recorded = await routes.record(
      session.id,
      json({ stationIndex: 0, stationId: "a", passed: true, meanScore: 0.9 }),
    );
    expect(recorded.status).toBe(200);

    const ended = await routes.end(session.id, json({ outcome: "completed" }));
    expect(ended.status).toBe(200);
    expect(await ended.json()).toMatchObject({ id: session.id, outcome: "completed" });

    const listed = await routes.list(new Request("http://test/api/study-sessions?userId=u1"));
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject([{ id: session.id, stationsPassed: 1 }]);
  });

  test("bad bodies are 400 and unknown sessions are 404", async () => {
    const routes = createStudySessionRoutes(openDatabase(":memory:"));
    expect((await routes.create(json({ userId: "u1" }))).status).toBe(400);
    expect(
      (
        await routes.record(
          "nope",
          json({ stationIndex: 0, stationId: "a", passed: true, meanScore: 1 }),
        )
      ).status,
    ).toBe(404);
    expect((await routes.end("nope", json({ outcome: "quit" }))).status).toBe(404);
    expect((await routes.list(new Request("http://test/api/study-sessions"))).status).toBe(400);
  });
});
