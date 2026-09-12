import { afterEach, beforeEach, expect, test } from "bun:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import { useConductorUi } from "@/features/conductor";
import { useWorld } from "@/features/world";
import { FocusBoard } from "./focus-board";

beforeEach(() => {
  useConductorUi.setState({ open: false });
  useWorld.setState({ trains: {}, localTrainId: null });
  const world = useWorld.getState();
  world.addTrain({
    id: "local",
    owner: { name: "You", spriteUrl: "/characters/poku.png" },
    phase: "running",
    efficiency: 0.8,
    focusedSeconds: 60,
    lane: 0,
  });
  world.addTrain({
    id: "friend-0",
    owner: { name: "Ada", spriteUrl: "/characters/bonbon.png" },
    phase: "running",
    efficiency: 0.4,
    focusedSeconds: 125,
    lane: 1,
  });
  world.setLocalTrainId("local");
});

afterEach(cleanup);

test("ranks riders by focused time and shows each one's live focus", () => {
  render(<FocusBoard />);

  const rows = within(screen.getByLabelText("Focus leaderboard"))
    .getAllByRole("listitem")
    .map((row) => row.textContent);
  expect(rows).toEqual(["1Ada2:05", "2You1:00"]);

  const live = within(screen.getByLabelText("Live focus"));
  expect(live.getByText("80%")).toBeTruthy();
  expect(live.getByText("40%")).toBeTruthy();
});

test("steps aside while the conductor panel is open", () => {
  useConductorUi.setState({ open: true });
  const { container } = render(<FocusBoard />);
  expect(container.innerHTML).toBe("");
});
