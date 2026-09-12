import { expect, test } from "bun:test";
import { FACE_FEATURES, FACE_FRAMES } from "./face-model";
import { FaceWindow } from "./face-window";

function frame(value: number) {
  return new Float32Array(FACE_FEATURES).fill(value);
}

test("warms up once, then slides by one camera frame without refilling", () => {
  const window = new FaceWindow();
  for (let i = 0; i < FACE_FRAMES - 1; i++) window.push(frame(i));
  expect(window.takeLatest()).toBeNull();
  window.push(frame(29));
  const first = window.takeLatest();
  expect(first?.[0]).toBe(0);
  expect(first?.[29 * FACE_FEATURES]).toBe(29);
  window.push(frame(30));
  const next = window.takeLatest();
  expect(window.size).toBe(30);
  expect(next?.[0]).toBe(1);
  expect(next?.[29 * FACE_FEATURES]).toBe(30);
  expect(first?.[0]).toBe(0);
});

test("coalesces incoming frames into the newest window during slow inference", () => {
  const window = new FaceWindow();
  for (let i = 0; i < 30; i++) window.push(frame(i));
  window.takeLatest();
  for (let i = 30; i < 100; i++) window.push(frame(i));
  const latest = window.takeLatest();
  expect(latest?.[0]).toBe(70);
  expect(latest?.[29 * FACE_FEATURES]).toBe(99);
  expect(window.size).toBe(30);
  expect(window.takeLatest()).toBeNull();
});

test("clearing on face loss or pause discards pending and historical frames", () => {
  const window = new FaceWindow();
  for (let i = 0; i < 30; i++) window.push(frame(i));
  window.clear();
  expect(window.size).toBe(0);
  expect(window.takeLatest()).toBeNull();
  window.push(frame(100));
  expect(window.takeLatest()).toBeNull();
});
