import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import type { PredictionState } from "./face-model";

const begin = mock(() => Promise.resolve({}));
const pause = mock(() => ({}));
const resume = mock(() => Promise.resolve({}));
const end = mock(() => ({}));
let positions: number[][] | null = null;
mock.module("./face-tracker", () => ({
  faceTracker: {
    begin,
    pause,
    resume,
    end,
    showVideoPreview: mock(),
    getPositions: () => positions,
  },
  subscribePrediction: () => () => {},
  getPrediction: () => prediction,
}));
let prediction: PredictionState = { status: "loading" };

const { Gaze } = await import("./gaze");
const { FacePrediction } = await import("./face-prediction");

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
}

afterEach(async () => {
  cleanup();
  // The tracker is shared module state: wait for the last user's release to
  // end it, so the next test starts a fresh one.
  await waitFor(() => expect(end).toHaveBeenCalled());
  for (const fn of [begin, pause, resume, end]) fn.mockClear();
  setHidden(false);
  positions = null;
  prediction = { status: "loading" };
});

test("starts one continuous MediaPipe tracker", async () => {
  render(<Gaze />);

  await waitFor(() => expect(begin).toHaveBeenCalledTimes(1));
  // The detection loop itself keeps running — sampling reads it, rather than
  // driving detection at a lower rate, which is what tracking accuracy relies on.
  expect(pause).not.toHaveBeenCalled();
});

test("pauses MediaPipe when the tab is hidden", async () => {
  render(<Gaze />);
  await waitFor(() => expect(begin).toHaveBeenCalledTimes(1));

  act(() => {
    setHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
  });

  expect(pause).toHaveBeenCalled();
});

test("resumes MediaPipe when the tab becomes visible again", async () => {
  render(<Gaze />);
  await waitFor(() => expect(begin).toHaveBeenCalledTimes(1));

  act(() => {
    setHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
  });
  act(() => {
    setHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await waitFor(() => expect(resume).toHaveBeenCalled());
});

test("reports the debounced looking-away state on transitions, not every tick", async () => {
  const onLookingAwayChange = mock();
  render(<Gaze onLookingAwayChange={onLookingAwayChange} />);
  await waitFor(() => expect(begin).toHaveBeenCalledTimes(1));

  act(() => {
    setHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(onLookingAwayChange).toHaveBeenCalledTimes(1);
  expect(onLookingAwayChange).toHaveBeenLastCalledWith(true);

  // Hiding again while already away is not a new transition.
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(onLookingAwayChange).toHaveBeenCalledTimes(1);
});

test("StrictMode's double mount shares one tracker and ends it once", async () => {
  const { unmount } = render(
    <StrictMode>
      <Gaze />
    </StrictMode>,
  );
  await waitFor(() => expect(begin).toHaveBeenCalledTimes(1));
  expect(end).not.toHaveBeenCalled();

  unmount();
  await waitFor(() => expect(end).toHaveBeenCalledTimes(1));
});

test("displays a prediction and all four raw scores in the normal HUD", async () => {
  prediction = { status: "ready", label: "Engagement", scores: [-2, 5, 1, 0] };
  const view = render(
    <>
      <Gaze />
      <FacePrediction />
    </>,
  );
  await waitFor(() => expect(begin).toHaveBeenCalled());
  expect(view.getByText("Prediction:")).toBeTruthy();
  expect(view.getByText("5.000")).toBeTruthy();
  expect(view.getByText("Boredom")).toBeTruthy();
  expect(view.getByText("Experimental model scores")).toBeTruthy();
});

test("shows inference failure without hiding the attention UI", async () => {
  prediction = { status: "error", message: "Model unavailable" };
  const view = render(
    <>
      <Gaze />
      <FacePrediction />
    </>,
  );
  await waitFor(() => expect(begin).toHaveBeenCalled());
  expect(view.getByRole("alert").textContent).toContain("Model unavailable");
  expect(view.getByText("Looking at the screen")).toBeTruthy();
});

test("shows new inference and frame counters even when scores do not change", async () => {
  const scores = [-2, 5, 1, 0];
  prediction = {
    status: "ready",
    label: "Engagement",
    scores,
    diagnostics: { predictionId: 1, frameId: 30, inferenceMs: 12, inputChange: null },
  };
  const view = render(
    <>
      <Gaze />
      <FacePrediction />
    </>,
  );
  await waitFor(() => expect(begin).toHaveBeenCalled());
  expect(view.getByText("Prediction #1 · Frame 30")).toBeTruthy();
  prediction = {
    status: "ready",
    label: "Engagement",
    scores,
    diagnostics: { predictionId: 2, frameId: 34, inferenceMs: 15, inputChange: 0.125 },
  };
  view.rerender(
    <>
      <Gaze />
      <FacePrediction />
    </>,
  );
  expect(view.getByText("Prediction #2 · Frame 34")).toBeTruthy();
  expect(view.getByText("Input change: 1.25e-1")).toBeTruthy();
  expect(view.getByText("5.000")).toBeTruthy();
});
