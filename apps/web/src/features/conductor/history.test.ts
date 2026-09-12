import { describe, expect, test } from "bun:test";
import { endHistory, fetchHistory, recordHistory, startHistory } from "./history";

type Call = { url: string; init: RequestInit | undefined };

function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, fetchFn };
}

const session = {
  id: "s1",
  userId: "u1",
  planId: "p1",
  stationTotal: 2,
  startedAt: "2026-09-12T10:00:00.000Z",
  endedAt: null,
  outcome: null,
};

describe("history", () => {
  test("startHistory posts the start and returns the id", async () => {
    const { calls, fetchFn } = fakeFetch(200, session);
    const id = await startHistory({ userId: "u1", planId: "p1", stationTotal: 2 }, fetchFn);
    expect(id).toBe("s1");
    expect(calls[0]?.url).toBe("/api/study-sessions");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  test("startHistory swallows failures and returns null", async () => {
    const { fetchFn } = fakeFetch(500, {});
    expect(await startHistory({ userId: "u1", planId: "p1", stationTotal: 2 }, fetchFn)).toBeNull();
  });

  test("recordHistory and endHistory post to the session and never throw", async () => {
    const { calls, fetchFn } = fakeFetch(200, {});
    await recordHistory(
      "s1",
      { stationIndex: 0, stationId: "a", passed: true, meanScore: 1 },
      fetchFn,
    );
    await endHistory("s1", "completed", fetchFn);
    expect(calls.map((c) => c.url)).toEqual([
      "/api/study-sessions/s1/stations",
      "/api/study-sessions/s1/end",
    ]);
    const { fetchFn: failing } = fakeFetch(500, {});
    await expect(endHistory("s1", "quit", failing)).resolves.toBeUndefined();
  });

  test("recordHistory and endHistory do nothing without a session id", async () => {
    const { calls, fetchFn } = fakeFetch(200, {});
    await recordHistory(
      null,
      { stationIndex: 0, stationId: "a", passed: true, meanScore: 1 },
      fetchFn,
    );
    await endHistory(null, "quit", fetchFn);
    expect(calls).toHaveLength(0);
  });

  test("fetchHistory parses the list and throws on failure", async () => {
    const summary = { ...session, stationsPassed: 1 };
    const { calls, fetchFn } = fakeFetch(200, [summary]);
    expect(await fetchHistory("u1", fetchFn)).toEqual([summary]);
    expect(calls[0]?.url).toBe("/api/study-sessions?userId=u1");
    const { fetchFn: failing } = fakeFetch(500, {});
    await expect(fetchHistory("u1", failing)).rejects.toThrow();
  });
});
