import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";

const begin = mock(() => Promise.resolve({}));
const pause = mock(() => ({}));
const resume = mock(() => Promise.resolve({}));
const end = mock(() => ({}));
const removeMouseEventListeners = mock(() => ({}));
const saveDataAcrossSessions = mock((_save: boolean) => Promise.resolve({}));
let positions: number[][] | null = null;

const fluent: Record<string, ReturnType<typeof mock>> = {
  showVideoPreview: mock(),
  showFaceOverlay: mock(),
  showFaceFeedbackBox: mock(),
  showPredictionPoints: mock(),
};
for (const setter of Object.values(fluent)) setter.mockImplementation(() => fluent);

mock.module("@webgazer-ts/core", () => ({
  default: {
    ...fluent,
    begin,
    pause,
    resume,
    end,
    removeMouseEventListeners,
    saveDataAcrossSessions,
    getTracker: () => ({ getPositions: () => positions }),
  },
}));

const { Gaze } = await import("./gaze");

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
}

afterEach(async () => {
  cleanup();
  // The tracker is shared module state: wait for the last user's release to
  // end it, so the next test starts a fresh one.
  await waitFor(() => expect(end).toHaveBeenCalled());
  for (const fn of [begin, pause, resume, end, removeMouseEventListeners]) fn.mockClear();
  saveDataAcrossSessions.mockClear();
  setHidden(false);
  positions = null;
});

test("starts WebGazer without the click-based regression it never reads", async () => {
  render(<Gaze />);

  await waitFor(() => expect(begin).toHaveBeenCalledTimes(1));
  expect(saveDataAcrossSessions).toHaveBeenCalledWith(false);
  expect(removeMouseEventListeners).toHaveBeenCalled();
  // The detection loop itself keeps running — sampling reads it, rather than
  // driving detection at a lower rate, which is what tracking accuracy relies on.
  expect(pause).not.toHaveBeenCalled();
});

test("pauses webgazer when the tab is hidden", async () => {
  render(<Gaze />);
  await waitFor(() => expect(begin).toHaveBeenCalledTimes(1));

  act(() => {
    setHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
  });

  expect(pause).toHaveBeenCalled();
});

test("resumes webgazer when the tab becomes visible again", async () => {
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
