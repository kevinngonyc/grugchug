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

// Boards the local train in the given phase, then starts the announcer, so
// the initial state is the "already there" baseline.
function boardThenStart(phase: TrainState["phase"]) {
  const w = useWorld.getState();
  w.addTrain({ ...local, phase });
  w.setLocalTrainId("local");
  announcer = createDepartureAnnouncer();
  announcer.start();
  return w;
}

describe("createDepartureAnnouncer", () => {
  test("says the start-of-session line when the local train appears running", () => {
    announcer = createDepartureAnnouncer();
    announcer.start();
    const w = useWorld.getState();
    w.addTrain({ ...local, phase: "running" });
    w.setLocalTrainId("local");
    expect(speechOf("local")?.text).toBe(VOICE_LINES.startSession.text);
    expect(speechOf("local")?.audioUrl).toBe("/audio/start_session1.mp3");
  });

  test("says the restart line when pulling out of a station", () => {
    const w = boardThenStart("stopped");
    expect(speechOf("local")).toBeUndefined();
    w.setPhase("local", "running");
    expect(speechOf("local")?.text).toBe(VOICE_LINES.restartStudy.text);
    expect(speechOf("local")?.audioUrl).toBe("/audio/restart_study1.mp3");
  });

  test("says the break line when stopping", () => {
    const w = boardThenStart("running");
    w.setPhase("local", "stopped");
    expect(speechOf("local")?.text).toBe(VOICE_LINES.takeBreak.text);
    expect(speechOf("local")?.audioUrl).toBe("/audio/take_break1.mp3");
  });

  test("says the great-session line when finishing", () => {
    const w = boardThenStart("running");
    w.setPhase("local", "finished");
    expect(speechOf("local")?.text).toBe(VOICE_LINES.greatSession.text);
    expect(speechOf("local")?.audioUrl).toBe("/audio/great_session1.mp3");
  });

  test("says the restart line when running again after finishing", () => {
    const w = boardThenStart("finished");
    w.setPhase("local", "running");
    expect(speechOf("local")?.text).toBe(VOICE_LINES.restartStudy.text);
  });

  test.each(["running", "stopped", "finished"] as const)(
    "does not announce a train that is already %s when it starts",
    (phase) => {
      const w = boardThenStart(phase);
      w.setEfficiency("local", 0.9);
      expect(speechOf("local")).toBeUndefined();
    },
  );

  test("says nothing when the phase is set to what it already is", () => {
    const w = boardThenStart("running");
    w.setPhase("local", "running");
    expect(speechOf("local")).toBeUndefined();
  });

  test("ignores friend trains", () => {
    const w = boardThenStart("stopped");
    w.addTrain(friend);
    w.setPhase("friend", "running");
    w.setPhase("friend", "stopped");
    expect(speechOf("friend")).toBeUndefined();
    expect(speechOf("local")).toBeUndefined();
  });

  test("every transition is a fresh utterance", () => {
    const w = boardThenStart("stopped");
    w.setPhase("local", "running");
    const first = speechOf("local")?.id;
    w.setPhase("local", "stopped");
    const second = speechOf("local")?.id;
    w.setPhase("local", "running");
    const third = speechOf("local")?.id;
    expect(new Set([first, second, third]).size).toBe(3);
  });

  test("stop unsubscribes", () => {
    const w = boardThenStart("stopped");
    announcer?.stop();
    w.setPhase("local", "running");
    expect(speechOf("local")).toBeUndefined();
  });
});
