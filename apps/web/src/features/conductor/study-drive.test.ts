import { beforeEach, describe, expect, test } from "bun:test";
import type { TrainState } from "@grugchug/shared";
import { useWorld } from "@/features/world";
import { applyStudyPhase, journeyForSession, phaseForMode } from "./study-drive";
import { useStudySession } from "./study-session";

const local: TrainState = {
  id: "local",
  owner: { name: "You", spriteUrl: "/characters/poku.png" },
  phase: "running",
  efficiency: 0.5,
  lane: 0,
};

const plan = { stations: [{}, {}, {}] } as never;

beforeEach(() => {
  useWorld.setState({ trains: {}, localTrainId: null });
  useStudySession.setState({ mode: "idle", stationIndex: 0, plan: null });
});

describe("phaseForMode", () => {
  test("only counting runs; complete is the terminus; the rest wait at a platform", () => {
    expect(phaseForMode("counting")).toBe("running");
    expect(phaseForMode("complete")).toBe("finished");
    for (const mode of ["idle", "at-station", "answering", "on-break"] as const) {
      expect(phaseForMode(mode)).toBe("stopped");
    }
  });
});

describe("journeyForSession", () => {
  test("maps modes and reports a 1-based station", () => {
    expect(journeyForSession({ mode: "idle", stationIndex: 0, plan: null })).toEqual({
      state: "idle",
      station: null,
    });
    expect(journeyForSession({ mode: "counting", stationIndex: 1, plan })).toEqual({
      state: "studying",
      station: { index: 2, total: 3 },
    });
    expect(journeyForSession({ mode: "answering", stationIndex: 2, plan }).state).toBe("answering");
    expect(journeyForSession({ mode: "on-break", stationIndex: 0, plan }).state).toBe("on-break");
    expect(journeyForSession({ mode: "at-station", stationIndex: 0, plan }).state).toBe(
      "at-station",
    );
    expect(journeyForSession({ mode: "complete", stationIndex: 2, plan }).state).toBe("finished");
  });
});

describe("applyStudyPhase", () => {
  test("sets the local train's phase from the study mode", () => {
    const w = useWorld.getState();
    w.addTrain(local);
    w.setLocalTrainId("local");
    useStudySession.setState({ mode: "at-station" });
    applyStudyPhase();
    expect(useWorld.getState().trains.local?.phase).toBe("stopped");
    useStudySession.setState({ mode: "counting" });
    applyStudyPhase();
    expect(useWorld.getState().trains.local?.phase).toBe("running");
  });

  test("does nothing without a local train", () => {
    useStudySession.setState({ mode: "counting" });
    applyStudyPhase();
    expect(useWorld.getState().trains).toEqual({});
  });
});
