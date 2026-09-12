// The whole chain the session is built on: what the webcam sees becomes a
// score, the score becomes the train's efficiency, and efficiency becomes the
// speed the scene eases toward.
import { beforeEach, expect, test } from "bun:test";
import {
  ATTENTION_HALF_LIFE_MS,
  ATTENTION_SOURCE,
  ATTENTION_STALE_HALF_LIFE_MS,
  ATTENTION_WEIGHT,
  EFFICIENCY_SCORE_MAX,
  useEfficiency,
} from "@/features/efficiency";
import { MAX_SPEED, MIN_SPEED, targetSpeed, useWorld } from "@/features/world";
import { resetFocusClock } from "./focus-time";
import { driveEfficiencyOnce } from "./use-efficiency-drive";

const NOW = 1_757_000_000_000;
const LOCAL = "local";

function localTrain() {
  const train = useWorld.getState().trains[LOCAL];
  if (!train) throw new Error("the local train went missing");
  return train;
}

// Seeds full attention directly, bypassing foldAttention's neutral opening —
// for tests where "eyes on the screen" is the setup, not the thing under test.
function seedFullAttention(at: number): void {
  useEfficiency.getState().report(ATTENTION_SOURCE, 1, {
    label: "Eyes on screen",
    weight: ATTENTION_WEIGHT,
    halfLifeMs: ATTENTION_STALE_HALF_LIFE_MS,
    at,
  });
}

beforeEach(() => {
  localStorage.removeItem("grugchug.focus.today");
  resetFocusClock();
  useEfficiency.getState().reset();
  useWorld.setState({ trains: {}, localTrainId: null });
  useWorld.getState().addTrain({
    id: LOCAL,
    owner: { name: "You", spriteUrl: "/characters/poku.png" },
    phase: "running",
    efficiency: 0,
    lane: 0,
  });
  useWorld.getState().setLocalTrainId(LOCAL);
});

test("eyes on the screen run the train at full speed", () => {
  seedFullAttention(NOW);
  driveEfficiencyOnce(NOW);

  expect(localTrain().efficiency).toBeCloseTo(1, 6);
  expect(targetSpeed(localTrain())).toBeCloseTo(MAX_SPEED, 6);
});

test("looking away slows the train without stranding it", () => {
  const efficiency = useEfficiency.getState();
  seedFullAttention(NOW);
  // Two half-lives of looking elsewhere.
  efficiency.reportAttention(false, NOW + ATTENTION_HALF_LIFE_MS);
  efficiency.reportAttention(false, NOW + 2 * ATTENTION_HALF_LIFE_MS);
  driveEfficiencyOnce(NOW + 2 * ATTENTION_HALF_LIFE_MS);

  const speed = targetSpeed(localTrain());
  expect(localTrain().efficiency).toBeCloseTo(0.25, 2);
  expect(speed).toBeGreaterThan(MIN_SPEED);
  expect(speed).toBeLessThan(MAX_SPEED / 2);
});

test("a bad quiz slows the train even while you are staring at it", () => {
  const efficiency = useEfficiency.getState();
  seedFullAttention(NOW);
  driveEfficiencyOnce(NOW);
  const before = targetSpeed(localTrain());

  efficiency.report("quiz", 0, { label: "Quiz", weight: 0.5, halfLifeMs: 600_000, at: NOW });
  driveEfficiencyOnce(NOW);

  expect(targetSpeed(localTrain())).toBeLessThan(before);
  expect(localTrain().efficiency).toBeCloseTo(
    useEfficiency.getState().score / EFFICIENCY_SCORE_MAX,
    6,
  );
});

test("the train picks back up as an old quiz fades, with nobody reporting", () => {
  const efficiency = useEfficiency.getState();
  seedFullAttention(NOW);
  efficiency.report("quiz", 0, { label: "Quiz", weight: 1, halfLifeMs: 60_000, at: NOW });
  driveEfficiencyOnce(NOW);
  expect(localTrain().efficiency).toBeCloseTo(0.5, 6);

  driveEfficiencyOnce(NOW + 7 * 60_000);
  expect(localTrain().efficiency).toBeCloseTo(1, 6);
  expect(targetSpeed(localTrain())).toBeCloseTo(MAX_SPEED, 6);
});

test("a stopped train stays stopped however good the score is", () => {
  seedFullAttention(NOW);
  useWorld.getState().setPhase(LOCAL, "stopped");
  driveEfficiencyOnce(NOW);

  expect(localTrain().efficiency).toBeCloseTo(1, 6);
  expect(targetSpeed(localTrain())).toBe(0);
});

test("the local train banks focused time at the rate of its score", () => {
  seedFullAttention(NOW);
  driveEfficiencyOnce(NOW);
  driveEfficiencyOnce(NOW + 500);
  driveEfficiencyOnce(NOW + 1000);

  expect(localTrain().focusedSeconds).toBeCloseTo(1, 2);
});

test("no local train is not an error", () => {
  useWorld.getState().setLocalTrainId(null);
  expect(() => driveEfficiencyOnce(NOW)).not.toThrow();
});
