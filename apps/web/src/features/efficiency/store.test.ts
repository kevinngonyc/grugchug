import { beforeEach, describe, expect, test } from "bun:test";
import { EFFICIENCY_SCORE_MAX, EFFICIENCY_SCORE_MIN, EFFICIENCY_SCORE_NEUTRAL } from "@grugchug/shared";
import { ATTENTION_HALF_LIFE_MS } from "./attention";
import {
  ATTENTION_SOURCE,
  ATTENTION_STALE_HALF_LIFE_MS,
  ATTENTION_WEIGHT,
  efficiencyFraction,
  useEfficiency,
} from "./store";

// Seeds full attention directly, bypassing foldAttention's neutral opening —
// for tests where "eyes on the screen" is the setup, not the thing under test.
function seedFullAttention(at: number): void {
  useEfficiency
    .getState()
    .report(ATTENTION_SOURCE, 1, {
      label: "Eyes on screen",
      weight: ATTENTION_WEIGHT,
      halfLifeMs: ATTENTION_STALE_HALF_LIFE_MS,
      at,
    });
}

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

test("attention opens at neutral, then folds toward what it sees", () => {
  const efficiency = useEfficiency.getState();
  efficiency.reportAttention(true, NOW);
  expect(useEfficiency.getState().signals[ATTENTION_SOURCE]?.value).toBeCloseTo(0.5, 6);

  // One half-life of looking closes half the gap between neutral and full.
  efficiency.reportAttention(true, NOW + ATTENTION_HALF_LIFE_MS);
  const attention = useEfficiency.getState().signals[ATTENTION_SOURCE];
  expect(attention?.value).toBeCloseTo(0.75, 6);
  expect(useEfficiency.getState().score).toBeCloseTo(75, 6);
});

test("a quiz moves the score without taking it over", () => {
  seedFullAttention(NOW);
  expect(useEfficiency.getState().score).toBeCloseTo(100, 6);

  useEfficiency.getState().report("quiz", 0, { label: "Quiz", weight: 0.5, at: NOW });
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
  seedFullAttention(NOW);
  useEfficiency.getState().report("quiz", 0, { label: "Quiz", weight: 1, halfLifeMs: 60_000, at: NOW });
  expect(useEfficiency.getState().score).toBeCloseTo(50, 6);

  useEfficiency.getState().tick(NOW + 7 * 60_000);
  expect(useEfficiency.getState().score).toBeCloseTo(100, 6);
});

test("dropping a source removes it from the blend", () => {
  seedFullAttention(NOW);
  useEfficiency.getState().report("manual", 0, { label: "Manual override", weight: 8, at: NOW });
  expect(useEfficiency.getState().score).toBeLessThan(20);

  useEfficiency.getState().drop("manual", NOW);
  expect(useEfficiency.getState().score).toBeCloseTo(100, 6);
});

describe("neutralize", () => {
  test("puts the score at neutral, not the floor", () => {
    const store = useEfficiency.getState();
    store.reset();
    store.report("quiz", 1, { weight: 1 });
    expect(useEfficiency.getState().score).toBe(EFFICIENCY_SCORE_MAX);

    useEfficiency.getState().neutralize();
    expect(useEfficiency.getState().score).toBe(EFFICIENCY_SCORE_NEUTRAL);
  });

  test("someone who was slacking is leveled up, not punished further", () => {
    const store = useEfficiency.getState();
    store.reset();
    store.report("quiz", 0, { weight: 1 });
    expect(useEfficiency.getState().score).toBe(EFFICIENCY_SCORE_MIN);

    useEfficiency.getState().neutralize();
    expect(useEfficiency.getState().score).toBe(EFFICIENCY_SCORE_NEUTRAL);
  });

  test("a fresh session is already neutral, and stays there", () => {
    useEfficiency.getState().reset();
    expect(useEfficiency.getState().score).toBe(EFFICIENCY_SCORE_NEUTRAL);
    useEfficiency.getState().neutralize();
    expect(useEfficiency.getState().score).toBe(EFFICIENCY_SCORE_NEUTRAL);
  });

  test("the next reading moves from neutral instead of undoing it", () => {
    const at = Date.now();
    useEfficiency.getState().reset();
    seedFullAttention(at);
    expect(useEfficiency.getState().score).toBe(EFFICIENCY_SCORE_MAX);

    useEfficiency.getState().neutralize(at);
    expect(useEfficiency.getState().score).toBe(EFFICIENCY_SCORE_NEUTRAL);

    // Eyes back on the screen a second later. If neutralize() had simply
    // forgotten the signal, attention would still open at neutral on its own
    // — so this is really checking that it moves *from* neutral rather than
    // reopening fresh, which only shows up as it keeps climbing afterward.
    useEfficiency.getState().reportAttention(true, at + 1_000);
    const soonAfter = useEfficiency.getState().score;
    expect(soonAfter).toBeGreaterThan(EFFICIENCY_SCORE_NEUTRAL);
    expect(soonAfter).toBeLessThan(EFFICIENCY_SCORE_NEUTRAL + 1);

    // A minute of it closes about half the remaining gap to full marks, by
    // attention's own half-life. Earned, not handed over.
    useEfficiency.getState().reportAttention(true, at + 61_000);
    expect(useEfficiency.getState().score).toBeGreaterThan(70);
    expect(useEfficiency.getState().score).toBeLessThan(80);
  });
});
