import { describe, expect, test } from "bun:test";
import { CHAT_USER_HEADER } from "@grugchug/shared";
import { openDatabase } from "../db";
import { createStudySessionRoutes } from "./study-sessions";

const json = (body: unknown, method = "POST") =>
  new Request("http://test/api/study-sessions", {
    method,
    headers: { "content-type": "application/json", [CHAT_USER_HEADER]: "u1" },
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

    const listed = await routes.list(
      new Request("http://test/api/study-sessions?userId=u1", {
        headers: { [CHAT_USER_HEADER]: "u1" },
      }),
    );
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

test("history rejects missing callers and cross-user reads and writes", async () => {
  const db = openDatabase(":memory:");
  try {
    const routes = createStudySessionRoutes(db);
    const session = await (await routes.create(json(start))).json();
    const other = (body: unknown) => {
      const req = json(body);
      req.headers.set(CHAT_USER_HEADER, "other");
      return req;
    };
    expect((await routes.create(other(start))).status).toBe(403);
    const missing = json(start);
    missing.headers.delete(CHAT_USER_HEADER);
    expect((await routes.create(missing)).status).toBe(401);
    expect(
      (
        await routes.record(
          session.id,
          other({ stationIndex: 0, stationId: "a", passed: true, meanScore: 1 }),
        )
      ).status,
    ).toBe(404);
    expect((await routes.end(session.id, other({ outcome: "quit" }))).status).toBe(404);
    expect((await routes.end(session.id, new Request("http://test"))).status).toBe(401);
    expect((await routes.record(session.id, new Request("http://test"))).status).toBe(401);
    const url = "http://test/api/study-sessions?userId=u1";
    expect((await routes.list(new Request(url))).status).toBe(401);
    expect(
      (await routes.list(new Request(url, { headers: { [CHAT_USER_HEADER]: "other" } }))).status,
    ).toBe(403);
    const listed = await routes.list(new Request(url, { headers: { [CHAT_USER_HEADER]: "u1" } }));
    expect(await listed.json()).toMatchObject([
      { id: session.id, outcome: null, stationsPassed: 0 },
    ]);
  } finally {
    db.close();
  }
});
