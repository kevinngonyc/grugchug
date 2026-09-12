import { expect, test } from "bun:test";
import { foldAttention } from "./attention";

const HALF_LIFE = 60_000;

test("the first observation is the starting value, not a climb from zero", () => {
  expect(foldAttention(null, true, 0, HALF_LIFE)).toBe(1);
  expect(foldAttention(null, false, 0, HALF_LIFE)).toBe(0);
});

test("one half-life of looking away costs half of what was there", () => {
  expect(foldAttention(1, false, HALF_LIFE, HALF_LIFE)).toBeCloseTo(0.5, 6);
});

test("one half-life of looking back closes half the gap", () => {
  expect(foldAttention(0, true, HALF_LIFE, HALF_LIFE)).toBeCloseTo(0.5, 6);
});

test("a glance away barely moves a well-earned average", () => {
  expect(foldAttention(0.9, false, 200, HALF_LIFE)).toBeGreaterThan(0.89);
});

test("no elapsed time means no change", () => {
  expect(foldAttention(0.42, true, 0, HALF_LIFE)).toBe(0.42);
});

test("the value stays inside 0..1 however long you wait", () => {
  let value = 0.5;
  for (let i = 0; i < 100; i++) value = foldAttention(value, i % 2 === 0, 5_000, HALF_LIFE);
  expect(value).toBeGreaterThanOrEqual(0);
  expect(value).toBeLessThanOrEqual(1);
});
