import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";

const begin = mock(() => Promise.resolve({}));
const pause = mock(() => ({}));
const resume = mock(() => Promise.resolve({}));
const end = mock(() => ({}));
const removeMouseEventListeners = mock(() => ({}));
const saveDataAcrossSessions = mock((_save: boolean) => Promise.resolve({}));
const getEyeFeatures = mock(() => Promise.resolve(null));

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
    getEyeFeatures,
    getTracker: () => ({ getPositions: () => null }),
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
  for (const fn of [begin, pause, resume, end, removeMouseEventListeners, getEyeFeatures]) {
    fn.mockClear();
  }
  saveDataAcrossSessions.mockClear();
  setHidden(false);
});

test("pauses WebGazer's own per-frame loop once it has started", async () => {
  render(<Gaze />);

  await waitFor(() => expect(pause).toHaveBeenCalled());
  expect(begin).toHaveBeenCalledTimes(1);
  expect(saveDataAcrossSessions).toHaveBeenCalledWith(false);
  expect(removeMouseEventListeners).toHaveBeenCalled();
});

test("asks for one face estimate per sample instead", async () => {
  render(<Gaze />);

  await waitFor(() => expect(getEyeFeatures).toHaveBeenCalled());
  expect(resume).not.toHaveBeenCalled();
});

test("a hidden tab asks for no estimates, and sampling picks up on return", async () => {
  render(<Gaze />);
  await waitFor(() => expect(getEyeFeatures).toHaveBeenCalled());

  act(() => {
    setHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
  });
  getEyeFeatures.mockClear();
  await new Promise((resolve) => setTimeout(resolve, 450));
  expect(getEyeFeatures).not.toHaveBeenCalled();

  act(() => {
    setHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await waitFor(() => expect(getEyeFeatures).toHaveBeenCalled());
});

test("StrictMode's double mount shares one tracker and ends it once", async () => {
  const { unmount } = render(
    <StrictMode>
      <Gaze />
    </StrictMode>,
  );
  await waitFor(() => expect(pause).toHaveBeenCalled());
  expect(begin).toHaveBeenCalledTimes(1);
  expect(end).not.toHaveBeenCalled();

  unmount();
  await waitFor(() => expect(end).toHaveBeenCalledTimes(1));
});
