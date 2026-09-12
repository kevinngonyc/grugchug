import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConductorPanel } from "./conductor-panel";
import { useStudySession } from "./study-session";

const initial = useStudySession.getState();
afterEach(() => {
  cleanup();
  useStudySession.setState(initial);
});

const plan = {
  id: "plan-1",
  userId: "u1",
  materialHash: "h",
  totalEstimatedMinutes: 10,
  stations: [
    { id: "s1", index: 0, title: "One", scope: "first", estimatedMinutes: 10, questions: [] },
  ],
};

test("a study stretch can be cut short to reach the station's quiz", () => {
  const skipTimer = mock(() => {});
  useStudySession.setState({
    plan,
    mode: "counting",
    timerEndsAt: Date.now() + 20 * 60_000,
    skipTimer,
  });

  render(<ConductorPanel />);
  fireEvent.click(screen.getByRole("button", { name: "Arrive now and take the quiz" }));

  expect(skipTimer).toHaveBeenCalled();
});

test("a break offers no shortcut to the quiz, only its own end", () => {
  useStudySession.setState({
    plan,
    mode: "on-break",
    timerEndsAt: Date.now() + 5 * 60_000,
  });

  render(<ConductorPanel />);

  expect(screen.queryByRole("button", { name: "Arrive now and take the quiz" })).toBeNull();
});
