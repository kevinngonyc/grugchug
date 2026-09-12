import { beforeEach, expect, test } from "bun:test";
import { ATTENTION_HALF_LIFE_MS } from "./attention";
import { ATTENTION_SOURCE, efficiencyFraction, useEfficiency } from "./store";

const NOW = 1_757_000_000_000;

beforeEach(() => {
  useEfficiency.getState().reset();
});

test("a fresh session sits at neutral until something reports", () => {
  expect(useEfficiency.getState().score).toBe(50);
});

test("a source reports and the score follows", () => {
  useEfficiency.getState().report("quiz", 0.9, { label: "Quiz", at: NOW });
  expect(useEfficiency.getState().score).toBeCloseTo(90, 6);
  expect(efficiencyFraction()).toBeCloseTo(0.9, 6);
});

test("attention folds observations into one running signal", () => {
  const efficiency = useEfficiency.getState();
  efficiency.reportAttention(true, NOW);
  efficiency.reportAttention(false, NOW + ATTENTION_HALF_LIFE_MS);

  const attention = useEfficiency.getState().signals[ATTENTION_SOURCE];
  expect(attention?.value).toBeCloseTo(0.5, 6);
  expect(useEfficiency.getState().score).toBeCloseTo(50, 6);
});

test("a quiz moves the score without taking it over", () => {
  const efficiency = useEfficiency.getState();
  efficiency.reportAttention(true, NOW);
  expect(useEfficiency.getState().score).toBeCloseTo(100, 6);

  efficiency.report("quiz", 0, { label: "Quiz", weight: 0.5, at: NOW });
  expect(useEfficiency.getState().score).toBeCloseTo(66.67, 1);
});

test("re-reporting keeps the weight and half-life it was given", () => {
  const efficiency = useEfficiency.getState();
  efficiency.report("quiz", 0.4, { label: "Quiz", weight: 0.5, halfLifeMs: 1_000, at: NOW });
  efficiency.report("quiz", 0.6, { at: NOW });

  const quiz = useEfficiency.getState().signals.quiz;
  expect(quiz?.weight).toBe(0.5);
  expect(quiz?.halfLifeMs).toBe(1_000);
  expect(quiz?.label).toBe("Quiz");
});

test("ticking lets an old signal fade without anyone reporting", () => {
  const efficiency = useEfficiency.getState();
  efficiency.reportAttention(true, NOW);
  efficiency.report("quiz", 0, { label: "Quiz", weight: 1, halfLifeMs: 60_000, at: NOW });
  expect(useEfficiency.getState().score).toBeCloseTo(50, 6);

  useEfficiency.getState().tick(NOW + 7 * 60_000);
  expect(useEfficiency.getState().score).toBeCloseTo(100, 6);
});

test("dropping a source removes it from the blend", () => {
  const efficiency = useEfficiency.getState();
  efficiency.reportAttention(true, NOW);
  efficiency.report("manual", 0, { label: "Manual override", weight: 8, at: NOW });
  expect(useEfficiency.getState().score).toBeLessThan(20);

  useEfficiency.getState().drop("manual", NOW);
  expect(useEfficiency.getState().score).toBeCloseTo(100, 6);
});
