import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConductorPanel } from "./conductor-panel";
import { useStudySession } from "./study-session";

const initial = useStudySession.getState();
afterEach(() => {
  cleanup();
  useStudySession.setState(initial);
});

test("the route summary offers regeneration, which bypasses the remembered route", () => {
  const studyAll = mock(async () => {});
  useStudySession.setState({
    mode: "idle",
    busy: false,
    error: null,
    studyAll,
    plan: {
      id: "route",
      userId: "u1",
      materialHash: "h",
      totalEstimatedMinutes: 5,
      stations: [
        { id: "s1", index: 0, title: "Light", scope: "Notes", estimatedMinutes: 5, questions: [] },
      ],
    },
  });
  render(<ConductorPanel />);
  // Routes are never sample content any more — the API refuses instead — so
  // there is no fallback alert to show.
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Regenerate route" }));
  expect(studyAll).toHaveBeenCalledWith(true);
});
