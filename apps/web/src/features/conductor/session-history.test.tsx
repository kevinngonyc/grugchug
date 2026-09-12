import { afterEach, expect, test } from "bun:test";
import type { StudySessionSummary } from "@grugchug/shared";
import { render, screen } from "@testing-library/react";
import { SessionHistory } from "./session-history";

const summary: StudySessionSummary = {
  id: "s1",
  userId: "u1",
  planId: "p1",
  stationTotal: 4,
  stationsPassed: 3,
  startedAt: "2026-09-12T10:00:00.000Z",
  endedAt: "2026-09-12T10:42:00.000Z",
  outcome: "completed",
};

test("shows a completed session's stations and duration", async () => {
  render(<SessionHistory load={() => Promise.resolve([summary])} />);
  expect(await screen.findByText(/3 of 4 stations/)).toBeTruthy();
  expect(screen.getByText(/42 min/)).toBeTruthy();
});

test("says history is unavailable when the load fails", async () => {
  render(<SessionHistory load={() => Promise.reject(new Error("nope"))} />);
  expect(await screen.findByText("History is unavailable right now.")).toBeTruthy();
});

test("says there are no sessions yet when the list is empty", async () => {
  render(<SessionHistory load={() => Promise.resolve([])} />);
  expect(
    await screen.findByText("No sessions yet. Open the conductor in a session to start one."),
  ).toBeTruthy();
});

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("fetches history exactly once with no load prop, even after it resolves", async () => {
  let calls = 0;
  globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    calls += 1;
    return new Response("[]", { status: 200 });
  }) as typeof fetch;

  render(<SessionHistory />);

  expect(
    await screen.findByText("No sessions yet. Open the conductor in a session to start one."),
  ).toBeTruthy();
  expect(calls).toBe(1);
});
