import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConductorPanel } from "./conductor-panel";
import { useStudySession } from "./study-session";

const initial = useStudySession.getState();
afterEach(() => {
  cleanup();
  useStudySession.setState(initial);
});

test("sample routes explain the fallback and offer regeneration", () => {
  const studyAll = mock(async () => {});
  useStudySession.setState({
    mode: "idle",
    busy: false,
    error: null,
    studyAll,
    plan: {
      id: "sample",
      userId: "u1",
      materialHash: "h",
      usedFallback: true,
      totalEstimatedMinutes: 5,
      stations: [
        { id: "s1", index: 0, title: "Light", scope: "Sample", estimatedMinutes: 5, questions: [] },
      ],
    },
  });
  render(<ConductorPanel />);
  expect(screen.getByRole("alert").textContent).toContain("sample");
  fireEvent.click(screen.getByRole("button", { name: "Regenerate route" }));
  expect(studyAll).toHaveBeenCalledWith(true);
});
