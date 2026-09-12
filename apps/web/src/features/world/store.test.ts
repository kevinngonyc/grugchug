import { beforeEach, describe, expect, test } from "bun:test";
import type { TrainState } from "@grugchug/shared";
import { useWorld } from "./store";

const local: TrainState = {
  id: "local",
  owner: { name: "You", spriteUrl: "/characters/default.svg" },
  phase: "stopped",
  efficiency: 0.5,
  lane: 0,
};

const friend: TrainState = {
  id: "friend",
  owner: { name: "Ada", spriteUrl: "/characters/default.svg" },
  phase: "running",
  efficiency: 0.8,
  lane: 1,
};

beforeEach(() => {
  useWorld.setState({ trains: {}, localTrainId: null });
});

describe("useWorld", () => {
  test("adds and removes trains", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    expect(useWorld.getState().trains.local).toEqual(local);
    w.removeTrain("local");
    expect(useWorld.getState().trains.local).toBeUndefined();
  });

  test("removing the local train clears localTrainId", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.setLocalTrainId("local");
    w.removeTrain("local");
    expect(useWorld.getState().localTrainId).toBeNull();
  });

  test("sets phase and efficiency on an existing train", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.setPhase("local", "running");
    w.setEfficiency("local", 0.9);
    expect(useWorld.getState().trains.local?.phase).toBe("running");
    expect(useWorld.getState().trains.local?.efficiency).toBe(0.9);
  });

  test("clamps efficiency to 0..1", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.setEfficiency("local", 4);
    expect(useWorld.getState().trains.local?.efficiency).toBe(1);
  });

  test("ignores commands for unknown trains", () => {
    useWorld.getState().setPhase("ghost", "running");
    expect(useWorld.getState().trains).toEqual({});
  });

  test("applySnapshot upserts and removes remote trains but keeps the local one", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.setLocalTrainId("local");
    w.addTrain({ ...friend, id: "gone", lane: 2 });
    w.applySnapshot({
      trains: { friend, local: { ...local, phase: "finished" } },
    });
    const { trains } = useWorld.getState();
    expect(trains.friend).toEqual(friend);
    expect(trains.gone).toBeUndefined();
    expect(trains.local?.phase).toBe("stopped");
  });
});
