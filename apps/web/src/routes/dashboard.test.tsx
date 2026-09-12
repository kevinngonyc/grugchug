import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Dashboard } from "./dashboard";

test("renders the dashboard heading", async () => {
  render(<Dashboard />);
  expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
  // SessionHistory calls the real fetchHistory, which has no API under
  // happy-dom and fails quietly. Wait for it to settle so the test does not
  // race the effect and leave an "act" warning behind. "Loading" also
  // matches the initial render, so it must stay out of this regex or the
  // assertion would pass before the fetch settles.
  expect(await screen.findByText(/unavailable|No sessions/)).toBeTruthy();
});
