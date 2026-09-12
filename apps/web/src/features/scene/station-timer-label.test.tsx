import { afterEach, expect, mock, test } from "bun:test";
import type { PublicRoutePlan } from "@grugchug/shared";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { useStudySession } from "@/features/conductor";

mock.module("@react-three/drei", () => ({
  Html: ({ children }: { children: ReactNode }) => <div data-testid="html">{children}</div>,
}));

const { StationTimerLabel, formatStationTimer } = await import("./station-timer-label");

const plan: PublicRoutePlan = {
  id: "plan-1",
  userId: "u1",
  materialHash: "h",
  totalEstimatedMinutes: 20,
  stations: [
    {
      id: "s1",
      index: 0,
      title: "One",
      scope: "first",
      estimatedMinutes: 10,
      questions: [],
    },
    {
      id: "s2",
      index: 1,
      title: "Two",
      scope: "second",
      estimatedMinutes: 10,
      questions: [],
    },
  ],
};

afterEach(() => {
  cleanup();
  useStudySession.setState({
    plan: null,
    stationIndex: 0,
    mode: "idle",
    timerEndsAt: null,
  });
});

test("formats remaining time with the current station", () => {
  expect(formatStationTimer(125, 0, 6)).toBe("2:05 · 1/6");
  expect(formatStationTimer(0, 5, 6)).toBe("0:00 · 6/6");
});

test("renders the pill while counting with a plan and timer", () => {
  useStudySession.setState({
    plan,
    stationIndex: 0,
    mode: "counting",
    timerEndsAt: Date.now() + 65_000,
  });

  render(<StationTimerLabel />);

  expect(screen.getByText(/1:0[45] · 1\/2/)).toBeTruthy();
});

test("hides when the session is idle", () => {
  useStudySession.setState({
    plan,
    stationIndex: 0,
    mode: "idle",
    timerEndsAt: Date.now() + 65_000,
  });

  render(<StationTimerLabel />);

  expect(screen.queryByText(/·/)).toBeNull();
});
