import { expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";

mock.module("@/features/gaze", () => ({
  Gaze: () => <div>Looking at the screen</div>,
}));

const { useEfficiency } = await import("@/features/efficiency");
const { FocusHud } = await import("./focus-hud");

test("FocusHud shows the current focus score", () => {
  useEfficiency.setState({ score: 73 });
  render(<FocusHud debug={false} />);
  expect(screen.getByText("Focus 73/100")).toBeTruthy();
});
