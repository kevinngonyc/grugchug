import { expect, test } from "bun:test";
import type { EfficiencySignal } from "@grugchug/shared";
import { effectiveWeight, scoreOf, scoreOrNeutral } from "./score";

const NOW = 1_757_000_000_000;

function signal(over: Partial<EfficiencySignal> = {}): EfficiencySignal {
  return {
    source: "attention",
    label: "Eyes on screen",
    value: 1,
    weight: 1,
    halfLifeMs: null,
    updatedAt: NOW,
    ...over,
  };
}

test("one source is the score, on a 0..100 scale", () => {
  expect(scoreOf([signal({ value: 0.73 })], NOW)).toBeCloseTo(73, 6);
});

test("nothing reporting is not a score of zero", () => {
  expect(scoreOf([], NOW)).toBeNull();
  expect(scoreOrNeutral([], NOW)).toBe(50);
});

test("sources blend by weight, so a light one cannot swing the score", () => {
  const attention = signal({ value: 1 });
  const quiz = signal({ source: "quiz", label: "Quiz", value: 0, weight: 0.5 });

  // 1×1 + 0×0.5 over 1.5 of weight.
  expect(scoreOf([attention, quiz], NOW)).toBeCloseTo(66.67, 1);
});

test("a reading is worth half as much after one half-life", () => {
  const quiz = signal({ source: "quiz", value: 1, weight: 1, halfLifeMs: 600_000 });
  expect(effectiveWeight(quiz, NOW + 600_000)).toBeCloseTo(0.5, 6);
  expect(effectiveWeight(quiz, NOW + 1_200_000)).toBeCloseTo(0.25, 6);
});

test("a signal with no half-life never fades", () => {
  const attention = signal({ halfLifeMs: null });
  expect(effectiveWeight(attention, NOW + 86_400_000)).toBe(1);
});

test("an old quiz stops counting instead of whispering forever", () => {
  const attention = signal({ value: 1 });
  const quiz = signal({ source: "quiz", value: 0, weight: 1, halfLifeMs: 60_000 });

  // Six half-lives in, the quiz is dropped and attention stands alone.
  expect(effectiveWeight(quiz, NOW + 7 * 60_000)).toBe(0);
  expect(scoreOf([attention, quiz], NOW + 7 * 60_000)).toBeCloseTo(100, 6);
});

test("a reading from the future counts in full, not more", () => {
  const quiz = signal({ source: "quiz", weight: 2, halfLifeMs: 60_000 });
  expect(effectiveWeight(quiz, NOW - 10_000)).toBe(2);
});

test("values outside 0..1 cannot push the score past its ends", () => {
  expect(scoreOf([signal({ value: 5 })], NOW)).toBe(100);
  expect(scoreOf([signal({ value: -3 })], NOW)).toBe(0);
});
