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

describe("speech commands", () => {
  test("say sets speech with a fresh id, the text, and the clip", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.say("local", "All aboard!", "/voices/1.mp3");
    const speech = useWorld.getState().trains.local?.speech;
    expect(speech?.text).toBe("All aboard!");
    expect(speech?.audioUrl).toBe("/voices/1.mp3");
    expect(speech?.id).toBeTruthy();
  });

  test("say without a clip leaves audioUrl undefined", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.say("local", "Hello");
    expect(useWorld.getState().trains.local?.speech?.audioUrl).toBeUndefined();
  });

  test("a new say replaces live speech under a new id", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.say("local", "one");
    const first = useWorld.getState().trains.local?.speech?.id;
    w.say("local", "two");
    const second = useWorld.getState().trains.local?.speech;
    expect(second?.text).toBe("two");
    expect(second?.id).not.toBe(first);
  });

  test("say on an unknown train is a no-op", () => {
    useWorld.getState().say("ghost", "boo");
    expect(useWorld.getState().trains).toEqual({});
  });

  test("clearSpeech removes the matching utterance and nothing else", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.say("local", "one");
    const id = useWorld.getState().trains.local?.speech?.id ?? "";
    w.clearSpeech("local", id);
    expect(useWorld.getState().trains.local).toEqual(local);
  });

  test("clearSpeech leaves a newer utterance alone", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.say("local", "one");
    const stale = useWorld.getState().trains.local?.speech?.id ?? "";
    w.say("local", "two");
    w.clearSpeech("local", stale);
    expect(useWorld.getState().trains.local?.speech?.text).toBe("two");
  });

  test("clearSpeech on an unknown train is a no-op", () => {
    useWorld.getState().clearSpeech("ghost", "x");
    expect(useWorld.getState().trains).toEqual({});
  });
});

describe("setOwner", () => {
  test("replaces the owner", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.setOwner("local", { name: "Ada", spriteUrl: "/characters/conductor.png" });
    expect(useWorld.getState().trains.local?.owner).toEqual({
      name: "Ada",
      spriteUrl: "/characters/conductor.png",
    });
  });
});
