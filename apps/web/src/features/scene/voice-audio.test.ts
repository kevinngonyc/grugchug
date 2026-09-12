import { afterEach, expect, mock, test } from "bun:test";
import { createVoiceAudio } from "./voice-audio";

const originalContext = globalThis.AudioContext;
let output: ReturnType<typeof createVoiceAudio> | undefined;
afterEach(() => {
  output?.dispose();
  globalThis.AudioContext = originalContext;
});

test("the first gesture unlocks audio before any asynchronous voice trigger", () => {
  const resume = mock(async () => {});
  const close = mock(async () => {});
  const construct = mock(() => {});
  globalThis.AudioContext = class {
    state = "suspended";
    resume = resume;
    close = close;
    constructor() {
      construct();
    }
  } as unknown as typeof AudioContext;
  output = createVoiceAudio();
  expect(construct).not.toHaveBeenCalled();
  window.dispatchEvent(new Event("pointerdown"));
  expect(construct).toHaveBeenCalledTimes(1);
  expect(resume).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event("keydown"));
  expect(construct).toHaveBeenCalledTimes(1);
  output.dispose();
  output = undefined;
  expect(close).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event("pointerdown"));
  expect(resume).toHaveBeenCalledTimes(2);
});
