import { expect, test } from "bun:test";
import {
  decodePrediction,
  FACE_FEATURES,
  flattenFace,
  inputChange,
  packSequence,
} from "./face-model";

test("preserves normalized xyz in landmark and temporal order for src/tgt", () => {
  const face = Array.from({ length: 478 }, (_, i) => ({ x: i / 478, y: 0.5, z: -0.125 }));
  const first = flattenFace(face);
  const last = flattenFace(face.map((p) => ({ ...p, y: 0.75 })));
  const packed = packSequence([...Array.from({ length: 29 }, () => first), last]);
  expect(packed.length).toBe(30 * 1434);
  expect(Array.from(packed.slice(0, 3))).toEqual([0, 0.5, -0.125]);
  expect(packed[29 * FACE_FEATURES + 1]).toBe(0.75);
  expect(packed[3]).toBeCloseTo(1 / 478);
});

test("rejects incompatible topology and incomplete sequences", () => {
  expect(() => flattenFace(Array(468).fill({ x: 0, y: 0, z: 0 }))).toThrow();
  expect(() => flattenFace(Array(478).fill({ x: NaN, y: 0, z: 0 }))).toThrow();
  expect(() => packSequence([])).toThrow();
});

test("maps four raw outputs to notebook targets without inventing probabilities", () => {
  expect(decodePrediction([-2, 5, 1, 0])).toEqual({
    status: "ready",
    label: "Engagement",
    scores: [-2, 5, 1, 0],
  });
  expect(() => decodePrediction([1, 2])).toThrow();
  expect(() => decodePrediction([1, 2, 3, Infinity])).toThrow();
});

test("measures changing model inputs even when output scores stay constant", () => {
  const a = new Float32Array([0, 0, 0, 0]);
  const b = new Float32Array([0, 0, 0, 2]);
  expect(inputChange(a, null)).toBeNull();
  expect(inputChange(a, a)).toBe(0);
  expect(inputChange(b, a)).toBe(1);
});
