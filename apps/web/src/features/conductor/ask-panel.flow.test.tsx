import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const askConductor = mock();

mock.module("./api", () => ({
  askConductor,
  createPlan: mock(),
  getPlan: mock(),
  setTimer: mock(),
  submitAnswer: mock(),
  evaluateProgress: mock(),
  ConductorApiError: class ConductorApiError extends Error {
    status = 500;
  },
}));

const { AskPanel } = await import("./ask-panel");
const { useMaterialLibrary } = await import("./material-library");

const plan = {
  id: "plan-1",
  userId: "u1",
  materialHash: "h",
  totalEstimatedMinutes: 10,
  stations: [
    {
      id: "s1",
      index: 0,
      title: "One",
      scope: "first",
      estimatedMinutes: 10,
      questions: [{ id: "q1", type: "short" as const, prompt: "Why?" }],
    },
  ],
};

test("with materials but no plan, tells the learner to press Study", () => {
  useMaterialLibrary.setState({
    items: [
      {
        id: "m1",
        name: "one.md",
        material: { kind: "text", text: "a" },
        createdAt: 1,
      },
      {
        id: "m2",
        name: "two.md",
        material: { kind: "text", text: "b" },
        createdAt: 2,
      },
    ],
    planId: null,
  });

  render(<AskPanel plan={null} />);

  expect(screen.getByText(/press Study/i)).toBeTruthy();
  expect(screen.getByPlaceholderText("Press Study first")).toBeTruthy();
  expect(screen.queryByPlaceholderText("Upload material first")).toBeNull();
});

test("shows the question and thinking dots before the answer types in", async () => {
  useMaterialLibrary.setState({ items: [], planId: null });
  let resolveAsk: (value: { answer: string }) => void = () => {};
  askConductor.mockImplementation(
    () =>
      new Promise<{ answer: string }>((resolve) => {
        resolveAsk = resolve;
      }),
  );

  render(<AskPanel plan={plan} />);
  fireEvent.change(screen.getByPlaceholderText("Ask a question…"), {
    target: { value: "What is condensation?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));

  expect(screen.getByText("What is condensation?")).toBeTruthy();
  expect(screen.getByRole("status")).toBeTruthy();

  resolveAsk({ answer: "Water vapor cooling." });

  await waitFor(() => {
    expect(screen.getByText("Water vapor cooling.")).toBeTruthy();
  });
});
