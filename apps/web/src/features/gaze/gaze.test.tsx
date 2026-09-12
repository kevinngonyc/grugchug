import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";

const pause = mock(() => ({}));
const resume = mock(() => Promise.resolve({}));
const end = mock(() => ({}));
const begin = mock(() => ({}));

const fluent: {
  showVideoPreview: ReturnType<typeof mock>;
  showFaceOverlay: ReturnType<typeof mock>;
  showFaceFeedbackBox: ReturnType<typeof mock>;
  showPredictionPoints: ReturnType<typeof mock>;
} = {
  showVideoPreview: mock(),
  showFaceOverlay: mock(),
  showFaceFeedbackBox: mock(),
  showPredictionPoints: mock(),
};
fluent.showVideoPreview.mockImplementation(() => fluent);
fluent.showFaceOverlay.mockImplementation(() => fluent);
fluent.showFaceFeedbackBox.mockImplementation(() => fluent);
fluent.showPredictionPoints.mockImplementation(() => fluent);

mock.module("@webgazer-ts/core", () => ({
  default: {
    ...fluent,
    begin,
    pause,
    resume,
    end,
    getTracker: () => ({ getPositions: () => null }),
  },
}));

const { Gaze } = await import("./gaze");

afterEach(() => {
  cleanup();
  pause.mockClear();
  resume.mockClear();
  begin.mockClear();
  end.mockClear();
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
});

test("pauses webgazer when the tab is hidden", () => {
  render(<Gaze />);
  expect(begin).toHaveBeenCalled();

  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  expect(pause).toHaveBeenCalled();
});

test("resumes webgazer when the tab becomes visible again", () => {
  render(<Gaze />);

  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  expect(resume).toHaveBeenCalled();
});
