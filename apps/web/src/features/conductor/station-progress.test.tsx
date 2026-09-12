import { expect, test } from "bun:test";
import type { PublicRoutePlan } from "@grugchug/shared";
import { render, screen } from "@testing-library/react";
import { StationProgress } from "./station-progress";

const plan: PublicRoutePlan = {
  id: "plan-1",
  userId: "u1",
  materialHash: "h",
  totalEstimatedMinutes: 30,
  stations: [
    {
      id: "s1",
      index: 0,
      title: "One",
      scope: "first",
      estimatedMinutes: 10,
      questions: [{ id: "q1", type: "short", prompt: "Why?" }],
    },
    {
      id: "s2",
      index: 1,
      title: "Two",
      scope: "second",
      estimatedMinutes: 20,
      questions: [{ id: "q2", type: "short", prompt: "How?" }],
    },
  ],
};

test("shows Station N of M for the current stop", () => {
  render(<StationProgress plan={plan} stationIndex={1} />);
  expect(screen.getByText("Station 2 of 2")).toBeTruthy();
});
