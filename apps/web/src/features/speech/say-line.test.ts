import { beforeEach, describe, expect, test } from "bun:test";
import type { TrainState } from "@grugchug/shared";
import { useWorld } from "@/features/world";
import { VOICE_LINES } from "./lines";
import { sayLine, sayText } from "./say-line";

const local: TrainState = {
  id: "local",
  owner: { name: "You", spriteUrl: "/characters/poku.png" },
  phase: "running",
  efficiency: 0.5,
  lane: 0,
};

const speechOf = (id: string) => useWorld.getState().trains[id]?.speech;

beforeEach(() => {
  useWorld.setState({ trains: {}, localTrainId: null });
});

describe("sayLine", () => {
  test("has the local conductor say a registered line with its clip", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.setLocalTrainId("local");
    sayLine("passQuiz");
    expect(speechOf("local")?.text).toBe(VOICE_LINES.passQuiz.text);
    expect(speechOf("local")?.audioUrl).toBe("/audio/pass_quiz1.mp3");
  });

  test("does nothing when there is no local train", () => {
    useWorld.getState().addTrain({ ...local, id: "friend" });
    sayLine("passQuiz");
    expect(speechOf("friend")).toBeUndefined();
    expect(useWorld.getState().trains.local).toBeUndefined();
  });
});

describe("sayText", () => {
  test("has the local conductor say a plain line with no clip", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.setLocalTrainId("local");
    sayText("Now arriving: Photosynthesis");
    expect(speechOf("local")?.text).toBe("Now arriving: Photosynthesis");
    expect(speechOf("local")?.audioUrl).toBeUndefined();
  });

  test("does nothing when there is no local train", () => {
    sayText("hello?");
    expect(useWorld.getState().trains).toEqual({});
  });
});
