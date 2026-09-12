import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { TrainState } from "@grugchug/shared";
import { useWorld } from "@/features/world";
import { createDepartureAnnouncer, type DepartureAnnouncer } from "./departure";
import { VOICE_LINES } from "./lines";

const local: TrainState = {
  id: "local",
  owner: { name: "You", spriteUrl: "/characters/poku.png" },
  phase: "stopped",
  efficiency: 0.5,
  lane: 0,
};

const friend: TrainState = { ...local, id: "friend", lane: 1 };

const speechOf = (id: string) => useWorld.getState().trains[id]?.speech;

// Every test starts its own announcer; unlike the speech player, its side
// effect is a synchronous store write, so a subscription left running from a
// previous test would announce false departures in this one. Tracked here so
// afterEach can always stop it, even for tests that never name the variable.
let announcer: DepartureAnnouncer | undefined;

beforeEach(() => {
  useWorld.setState({ trains: {}, localTrainId: null });
});

afterEach(() => {
  announcer?.stop();
  announcer = undefined;
});

describe("createDepartureAnnouncer", () => {
  test("announces when the local train appears running", () => {
    announcer = createDepartureAnnouncer();
    announcer.start();
    const w = useWorld.getState();
    w.addTrain({ ...local, phase: "running" });
    w.setLocalTrainId("local");
    expect(speechOf("local")?.text).toBe(VOICE_LINES.startSession.text);
    expect(speechOf("local")?.audioUrl).toBe("/audio/start_session1.mp3");
  });

  test("announces a departure from stopped to running", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.setLocalTrainId("local");
    announcer = createDepartureAnnouncer();
    announcer.start();
    expect(speechOf("local")).toBeUndefined();
    w.setPhase("local", "running");
    expect(speechOf("local")?.text).toBe(VOICE_LINES.startSession.text);
  });

  test("does not announce a train that is already running when it starts", () => {
    const w = useWorld.getState();
    w.addTrain({ ...local, phase: "running" });
    w.setLocalTrainId("local");
    announcer = createDepartureAnnouncer();
    announcer.start();
    w.setEfficiency("local", 0.9);
    expect(speechOf("local")).toBeUndefined();
  });

  test("does not announce stopping", () => {
    const w = useWorld.getState();
    w.addTrain({ ...local, phase: "running" });
    w.setLocalTrainId("local");
    announcer = createDepartureAnnouncer();
    announcer.start();
    w.setPhase("local", "stopped");
    expect(speechOf("local")).toBeUndefined();
  });

  test("ignores friend trains", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.setLocalTrainId("local");
    w.addTrain(friend);
    announcer = createDepartureAnnouncer();
    announcer.start();
    w.setPhase("friend", "running");
    expect(speechOf("friend")).toBeUndefined();
    expect(speechOf("local")).toBeUndefined();
  });

  test("announces every departure with a fresh utterance", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.setLocalTrainId("local");
    announcer = createDepartureAnnouncer();
    announcer.start();
    w.setPhase("local", "running");
    const first = speechOf("local")?.id;
    w.setPhase("local", "stopped");
    w.setPhase("local", "running");
    expect(speechOf("local")?.id).toBeTruthy();
    expect(speechOf("local")?.id).not.toBe(first);
  });

  test("stop unsubscribes", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.setLocalTrainId("local");
    announcer = createDepartureAnnouncer();
    announcer.start();
    announcer.stop();
    w.setPhase("local", "running");
    expect(speechOf("local")).toBeUndefined();
  });
});
