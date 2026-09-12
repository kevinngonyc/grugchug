// Offline: ./api is stubbed via mock.module before study-session.ts (which
// imports it) is loaded, so nothing here touches the network. The world
// store is real — same pattern as features/session/use-party-trains.test.ts
// — since setPhase's actual effect is exactly what these tests check.
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { useWorld } from "@/features/world";

const apiMocks = {
  createPlan: mock(),
  getPlan: mock(),
  setTimer: mock(),
  submitAnswer: mock(),
  evaluateProgress: mock(),
  askConductor: mock(),
};

mock.module("./api", () => apiMocks);

const { useStudySession } = await import("./study-session");
const { useConductorUi } = await import("./store");
const { useMaterialLibrary } = await import("./material-library");

const plan = {
  id: "plan-1",
  userId: "u1",
  materialHash: "h",
  totalEstimatedMinutes: 20,
  stations: [
    {
      id: "s1",
      index: 0,
      title: "One",
      scope: "first",
      estimatedMinutes: 10,
      questions: [
        { id: "q1", type: "mcq" as const, prompt: "2+2?", choices: ["3", "4"] },
        { id: "q2", type: "short" as const, prompt: "Why?" },
      ],
    },
    {
      id: "s2",
      index: 1,
      title: "Two",
      scope: "second",
      estimatedMinutes: 10,
      questions: [{ id: "q3", type: "mcq" as const, prompt: "1+1?", choices: ["1", "2"] }],
    },
  ],
};

beforeEach(() => {
  for (const m of Object.values(apiMocks)) m.mockReset();
  useWorld.setState({ trains: {}, localTrainId: null, regroups: 0 });
  useWorld.getState().addTrain({
    id: "local",
    owner: { name: "You", spriteUrl: "/characters/default.svg" },
    phase: "running",
    efficiency: 0.5,
    lane: 0,
  });
  useWorld.getState().setLocalTrainId("local");
  useConductorUi.setState({ open: true });
  useMaterialLibrary.setState({ items: [], planId: null });
  localStorage.removeItem("grugchug.conductor.library");
  useStudySession.setState({
    plan: null,
    stationIndex: 0,
    mode: "idle",
    timerEndsAt: null,
    timerMessage: null,
    lastStretchMinutes: null,
    answers: {},
    results: {},
    stationFeedback: null,
    busy: false,
    error: null,
  });
});

describe("startSession", () => {
  test("resets to station 0 in idle mode", () => {
    useStudySession.getState().startSession(plan);
    const s = useStudySession.getState();
    expect(s.plan).toBe(plan);
    expect(s.stationIndex).toBe(0);
    expect(s.mode).toBe("idle");
  });
});

describe("studyAll", () => {
  function addTwoMaterials() {
    useMaterialLibrary.getState().add("one.pdf", { kind: "text", text: "lecture one" });
    useMaterialLibrary.getState().add("two.pdf", { kind: "text", text: "lecture two" });
  }

  test("builds one route from every uploaded material and remembers it", async () => {
    apiMocks.createPlan.mockResolvedValue(plan);
    addTwoMaterials();

    await useStudySession.getState().studyAll();

    expect(apiMocks.createPlan).toHaveBeenCalledTimes(1);
    expect(apiMocks.createPlan.mock.calls[0]?.[0].materials).toEqual([
      { kind: "text", text: "lecture one" },
      { kind: "text", text: "lecture two" },
    ]);
    expect(useStudySession.getState().plan).toBe(plan);
    expect(useMaterialLibrary.getState().planId).toBe(plan.id);
  });

  test("reuses the route already built from this set instead of generating a new one", async () => {
    apiMocks.getPlan.mockResolvedValue(plan);
    addTwoMaterials();
    useMaterialLibrary.getState().setPlanId("plan-1");

    await useStudySession.getState().studyAll();

    expect(apiMocks.getPlan).toHaveBeenCalledWith("plan-1");
    expect(apiMocks.createPlan).not.toHaveBeenCalled();
    expect(useStudySession.getState().plan).toBe(plan);
  });

  test("falls back to generating when the remembered route can't be fetched", async () => {
    apiMocks.getPlan.mockRejectedValue(new Error("404"));
    apiMocks.createPlan.mockResolvedValue(plan);
    addTwoMaterials();
    useMaterialLibrary.getState().setPlanId("gone");

    await useStudySession.getState().studyAll();

    expect(apiMocks.createPlan).toHaveBeenCalledTimes(1);
    expect(useStudySession.getState().plan).toBe(plan);
    expect(useStudySession.getState().error).toBeNull();
  });

  test("does nothing with an empty library", async () => {
    await useStudySession.getState().studyAll();

    expect(apiMocks.createPlan).not.toHaveBeenCalled();
    expect(useStudySession.getState().plan).toBeNull();
  });

  test("surfaces an error when the route cannot be built", async () => {
    apiMocks.createPlan.mockRejectedValue(new Error("network down"));
    addTwoMaterials();

    await useStudySession.getState().studyAll();

    expect(useStudySession.getState().plan).toBeNull();
    expect(useStudySession.getState().error).toBeTruthy();
    expect(useStudySession.getState().busy).toBe(false);
  });
});

describe("startStudying", () => {
  test("starts a countdown from the model's suggested minutes and closes the panel", async () => {
    apiMocks.setTimer.mockResolvedValue({ minutes: 5, message: "Let's go" });
    useStudySession.getState().startSession(plan);

    await useStudySession.getState().startStudying();

    const s = useStudySession.getState();
    expect(s.mode).toBe("counting");
    expect(s.timerMessage).toBe("Let's go");
    expect(s.lastStretchMinutes).toBe(5);
    expect(s.timerEndsAt).not.toBeNull();
    expect(useConductorUi.getState().open).toBe(false);
  });

  test("surfaces an error and does not change mode when the call fails", async () => {
    apiMocks.setTimer.mockRejectedValue(new Error("network down"));
    useStudySession.getState().startSession(plan);

    await useStudySession.getState().startStudying();

    const s = useStudySession.getState();
    expect(s.mode).toBe("idle");
    expect(s.error).toBeTruthy();
  });
});

describe("tick", () => {
  test("stops the train and moves to at-station once a study countdown elapses", () => {
    useStudySession.getState().startSession(plan);
    useStudySession.setState({ mode: "counting", timerEndsAt: Date.now() - 1 });

    useStudySession.getState().tick();

    expect(useStudySession.getState().mode).toBe("at-station");
    expect(useWorld.getState().trains.local?.phase).toBe("stopped");
  });

  test("returns to at-station without touching train phase once a break elapses", () => {
    useStudySession.getState().startSession(plan);
    useStudySession.setState({ mode: "on-break", timerEndsAt: Date.now() - 1 });

    useStudySession.getState().tick();

    expect(useStudySession.getState().mode).toBe("at-station");
    expect(useWorld.getState().trains.local?.phase).toBe("running");
  });

  test("does nothing before the timer has elapsed", () => {
    useStudySession.getState().startSession(plan);
    useStudySession.setState({ mode: "counting", timerEndsAt: Date.now() + 60_000 });

    useStudySession.getState().tick();

    expect(useStudySession.getState().mode).toBe("counting");
  });
});

describe("submitAllAndFinish", () => {
  function answerEverything() {
    useStudySession.getState().setAnswer("q1", { type: "mcq", choiceIndex: 1 });
    useStudySession.getState().setAnswer("q2", { type: "short", text: "because" });
  }

  test("advances to the next station and starts its timer when the station passes", async () => {
    apiMocks.submitAnswer.mockImplementation(async (_stationId, body: { questionId: string }) => ({
      questionId: body.questionId,
      score: 1,
      passed: true,
      feedback: "Correct.",
    }));
    apiMocks.evaluateProgress.mockResolvedValue({ passed: true, feedback: "Great work." });
    apiMocks.setTimer.mockResolvedValue({ minutes: 8, message: "Next up" });

    useStudySession.getState().startSession(plan);
    useStudySession.setState({ mode: "answering" });
    answerEverything();

    await useStudySession.getState().submitAllAndFinish();

    const s = useStudySession.getState();
    expect(s.stationIndex).toBe(1);
    expect(s.mode).toBe("counting"); // startStudying ran for station 2
    expect(useWorld.getState().trains.local?.phase).toBe("running");
  });

  test("goes back to at-station with feedback, keeping the same station, when it fails", async () => {
    apiMocks.submitAnswer.mockResolvedValue({
      questionId: "q1",
      score: 0,
      passed: false,
      feedback: "Not quite.",
    });
    apiMocks.evaluateProgress.mockResolvedValue({ passed: false, feedback: "Try again." });

    useStudySession.getState().startSession(plan);
    useStudySession.setState({ mode: "answering" });
    answerEverything();

    await useStudySession.getState().submitAllAndFinish();

    const s = useStudySession.getState();
    expect(s.stationIndex).toBe(0);
    expect(s.mode).toBe("at-station");
    expect(s.stationFeedback).toBe("Try again.");
  });

  test("reaches complete after the last station passes", async () => {
    apiMocks.submitAnswer.mockResolvedValue({
      questionId: "q3",
      score: 1,
      passed: true,
      feedback: "Correct.",
    });
    apiMocks.evaluateProgress.mockResolvedValue({ passed: true, feedback: "All done." });

    useStudySession.getState().startSession(plan);
    useStudySession.setState({ stationIndex: 1, mode: "answering" });
    useStudySession.getState().setAnswer("q3", { type: "mcq", choiceIndex: 0 });

    await useStudySession.getState().submitAllAndFinish();

    expect(useStudySession.getState().mode).toBe("complete");
    expect(useWorld.getState().trains.local?.phase).toBe("running");
  });

  test("refuses to submit until every question has an answer", async () => {
    useStudySession.getState().startSession(plan);
    useStudySession.setState({ mode: "answering" });
    useStudySession.getState().setAnswer("q1", { type: "mcq", choiceIndex: 0 }); // q2 left blank

    await useStudySession.getState().submitAllAndFinish();

    expect(apiMocks.submitAnswer).not.toHaveBeenCalled();
    expect(useStudySession.getState().error).toBeTruthy();
  });
});

describe("skipTimer", () => {
  test("ends a study countdown now: the train stops and the station is up", () => {
    useStudySession.getState().startSession(plan);
    useStudySession.setState({ mode: "counting", timerEndsAt: Date.now() + 25 * 60_000 });

    useStudySession.getState().skipTimer();

    expect(useStudySession.getState().mode).toBe("at-station");
    expect(useStudySession.getState().timerEndsAt).toBeNull();
    expect(useWorld.getState().trains.local?.phase).toBe("stopped");
  });

  test("ends a break early back at the station", () => {
    useStudySession.getState().startSession(plan);
    useStudySession.setState({ mode: "on-break", timerEndsAt: Date.now() + 5 * 60_000 });

    useStudySession.getState().skipTimer();

    expect(useStudySession.getState().mode).toBe("at-station");
  });

  test("does nothing when no countdown is running", () => {
    useStudySession.getState().startSession(plan);

    useStudySession.getState().skipTimer();

    expect(useStudySession.getState().mode).toBe("idle");
    expect(useWorld.getState().trains.local?.phase).toBe("running");
  });
});

describe("quit", () => {
  test("clears the session and resumes a train left stopped at a station", () => {
    useStudySession.getState().startSession(plan);
    useWorld.getState().setPhase("local", "stopped");
    useStudySession.setState({ mode: "at-station" });

    useStudySession.getState().quit();

    const s = useStudySession.getState();
    expect(s.plan).toBeNull();
    expect(s.mode).toBe("idle");
    expect(useWorld.getState().trains.local?.phase).toBe("running");
  });
});
