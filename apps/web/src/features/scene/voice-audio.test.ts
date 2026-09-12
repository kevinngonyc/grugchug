import { afterEach, expect, mock, test } from "bun:test";
import { createVoiceAudio, updateVoiceListener } from "./voice-audio";

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

const camera = {
  position: { x: 1, y: 2, z: 3 },
  forward: { x: 0, y: 0, z: 2 },
  up: { x: 0, y: 1, z: 0 },
};

// Firefox has no positional AudioParams on AudioListener (positionX, forwardX,
// upX…), only the older setPosition()/setOrientation() methods. Once the
// context exists, the listener is updated every frame from the scene loop, so
// a throw here blanks the whole scene and stops the camera rig.
test("a listener without positional AudioParams is placed through setPosition/setOrientation", () => {
  const setPosition = mock(() => {});
  const setOrientation = mock(() => {});
  globalThis.AudioContext = class {
    state = "running";
    listener = { setPosition, setOrientation };
    resume = async () => {};
    close = async () => {};
  } as unknown as typeof AudioContext;
  output = createVoiceAudio();
  window.dispatchEvent(new Event("pointerdown"));

  expect(() => updateVoiceListener(camera.position, camera.forward, camera.up)).not.toThrow();
  expect(setPosition).toHaveBeenLastCalledWith(1, 2, 3);
  expect(setOrientation).toHaveBeenLastCalledWith(0, 0, 1, 0, 1, 0);
});

test("a listener with positional AudioParams is placed through them", () => {
  const param = () => ({ value: 0 });
  const listener = {
    positionX: param(),
    positionY: param(),
    positionZ: param(),
    forwardX: param(),
    forwardY: param(),
    forwardZ: param(),
    upX: param(),
    upY: param(),
    upZ: param(),
  };
  globalThis.AudioContext = class {
    state = "running";
    listener = listener;
    resume = async () => {};
    close = async () => {};
  } as unknown as typeof AudioContext;
  output = createVoiceAudio();
  window.dispatchEvent(new Event("pointerdown"));

  updateVoiceListener(camera.position, camera.forward, camera.up);
  const values = (...params: { value: number }[]) => params.map((p) => p.value);
  expect(values(listener.positionX, listener.positionY, listener.positionZ)).toEqual([1, 2, 3]);
  expect(values(listener.forwardX, listener.forwardY, listener.forwardZ)).toEqual([0, 0, 1]);
  expect(values(listener.upX, listener.upY, listener.upZ)).toEqual([0, 1, 0]);
});
