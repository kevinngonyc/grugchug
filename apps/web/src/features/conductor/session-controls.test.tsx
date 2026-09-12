import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SessionControls } from "./session-controls";
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

test("a running break can be ended from the same button that started it", () => {
  const endBreak = mock(() => {});
  useStudySession.setState({ plan, mode: "on-break", busy: false, endBreak });

  render(<SessionControls />);
  const button = screen.getByRole("button", { name: "Resume studying" });
  expect(button.hasAttribute("disabled")).toBe(false);

  fireEvent.click(button);
  expect(endBreak).toHaveBeenCalled();
});

test("mid-stretch the button offers a break instead", () => {
  const chooseBreak = mock(async () => {});
  useStudySession.setState({ plan, mode: "counting", busy: false, chooseBreak });

  render(<SessionControls />);
  fireEvent.click(screen.getByRole("button", { name: "Take a break" }));

  expect(chooseBreak).toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Resume studying" })).toBeNull();
});
