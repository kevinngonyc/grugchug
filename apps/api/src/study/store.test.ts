import { describe, expect, test } from "bun:test";
import { openDatabase } from "../db";
import {
  endStudySession,
  listStudySessions,
  recordStationResult,
  startStudySession,
} from "./store";

const start = { userId: "u1", planId: "p1", stationTotal: 3 };

describe("study store", () => {
  test("starts an open session", async () => {
    const db = openDatabase(":memory:");
    const session = await startStudySession(start, db);
    expect(session).toMatchObject({ ...start, endedAt: null, outcome: null });
    expect(session.id.length).toBeGreaterThan(0);
  });

  test("records attempts and counts only the latest per station as passed", async () => {
    const db = openDatabase(":memory:");
    const session = await startStudySession(start, db);
    const first = await recordStationResult(
      session.id,
      { stationIndex: 0, stationId: "a", passed: false, meanScore: 0.3 },
      db,
    );
    expect(first).toMatchObject({ sessionId: session.id, stationIndex: 0, passed: false });
    await recordStationResult(
      session.id,
      { stationIndex: 0, stationId: "a", passed: true, meanScore: 0.9 },
      db,
    );
    await recordStationResult(
      session.id,
      { stationIndex: 1, stationId: "b", passed: true, meanScore: 0.8 },
      db,
    );
    // Station 1 passed, then a later attempt failed: latest wins.
    await recordStationResult(
      session.id,
      { stationIndex: 1, stationId: "b", passed: false, meanScore: 0.2 },
      db,
    );
    const [summary] = await listStudySessions("u1", db);
    expect(summary?.stationsPassed).toBe(1);
  });

  test("ending sets the outcome and time", async () => {
    const db = openDatabase(":memory:");
    const session = await startStudySession(start, db);
    const ended = await endStudySession(session.id, "completed", db);
    expect(ended?.outcome).toBe("completed");
    expect(ended?.endedAt).not.toBeNull();
  });

  test("a session already ended cannot be ended again", async () => {
    const db = openDatabase(":memory:");
    const session = await startStudySession(start, db);
    const first = await endStudySession(session.id, "completed", db);
    expect(first?.outcome).toBe("completed");
    const second = await endStudySession(session.id, "quit", db);
    expect(second).toBeNull();
    // The second attempt must not have overwritten the first outcome.
    const [summary] = await listStudySessions("u1", db);
    expect(summary?.outcome).toBe("completed");
  });

  test("unknown sessions are null", async () => {
    const db = openDatabase(":memory:");
    expect(
      await recordStationResult(
        "nope",
        { stationIndex: 0, stationId: "a", passed: true, meanScore: 1 },
        db,
      ),
    ).toBeNull();
    expect(await endStudySession("nope", "quit", db)).toBeNull();
  });

  test("lists a user's sessions newest first, others excluded", async () => {
    const db = openDatabase(":memory:");
    const older = await startStudySession(start, db);
    await new Promise((r) => setTimeout(r, 2));
    const newer = await startStudySession(start, db);
    await startStudySession({ ...start, userId: "u2" }, db);
    const list = await listStudySessions("u1", db);
    expect(list.map((s) => s.id)).toEqual([newer.id, older.id]);
  });
});
