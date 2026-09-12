import { expect, mock, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";

let lastOnLookingAwayChange: ((away: boolean) => void) | undefined;

mock.module("@/features/gaze", () => ({
  Gaze: ({ onLookingAwayChange }: { onLookingAwayChange?: (away: boolean) => void }) => {
    lastOnLookingAwayChange = onLookingAwayChange;
    return <div>Looking at the screen</div>;
  },
}));

const { useEfficiency } = await import("@/features/efficiency");
const { FocusHud } = await import("./focus-hud");

test("FocusHud shows the current focus score", () => {
  useEfficiency.setState({ score: 73 });
  render(<FocusHud debug={false} />);
  expect(screen.getByText("Focus 73/100")).toBeTruthy();
});

test("borders green while facing the screen, red once looking away", () => {
  const { container } = render(<FocusHud debug={false} />);
  const box = container.firstElementChild;

  expect(box?.className).toContain("border-green-500");

  act(() => lastOnLookingAwayChange?.(true));
  expect(box?.className).toContain("border-red-500");

  act(() => lastOnLookingAwayChange?.(false));
  expect(box?.className).toContain("border-green-500");
});
