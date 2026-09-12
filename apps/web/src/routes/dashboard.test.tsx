import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Dashboard } from "./dashboard";

test("renders the dashboard heading", () => {
  render(<Dashboard />);
  expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
});
