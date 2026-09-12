// Offline: ./api and ./history are stubbed via mock.module before
// study-session.ts (which imports both) is loaded, so nothing here touches
// the network. The world store and efficiency store are real — same pattern
// as features/session/use-party-trains.test.ts — since applyStudyPhase's and
// report's actual effects are exactly what these tests check. The real
// modules are captured up front and restored in afterAll: mock.module patches
// the module registry for the whole process, not just this file, and other
// test files (session-history.test.tsx, dashboard.test.tsx) import the real
// ./history (see features/session/use-journey-link.test.ts for the same
// restore pattern).
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { useEfficiency } from "@/features/efficiency";
import { VOICE_LINES } from "@/features/speech";
import { useWorld } from "@/features/world";

const realApi = await import("./api");
const realHistory = await import("./history");

const apiMocks = {
  createPlan: mock(),
  getPlan: mock(),
  setTimer: mock(),
  submitAnswer: mock(),
  evaluateProgress: mock(),
  askConductor: mock(),
};

const historyMocks = {
  startHistory: mock(),
  recordHistory: mock(),
  endHistory: mock(),
  fetchHistory: mock(),
};

mock.module("./api", () => apiMocks);
mock.module("./history", () => historyMocks);

const { useStudySession } = await import("./study-session");
const { useConductorUi } = await import("./store");
const { useMaterialLibrary } = await import("./material-library");
const { applyStudyPhase } = await import("./study-drive");

afterAll(() => {
  mock.module("./api", () => realApi);
  mock.module("./history", () => realHistory);
});

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

function speechOf() {
  return useWorld.getState().trains.local?.speech;
}

// Lets every already-resolved microtask run before a pending-promise
// assertion, without depending on how many `await`s a mocked resolution
// takes to settle.
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  for (const m of Object.values(apiMocks)) m.mockReset();
  for (const m of Object.values(historyMocks)) m.mockReset();
  historyMocks.startHistory.mockResolvedValue("h1");
  historyMocks.recordHistory.mockResolvedValue(undefined);
  historyMocks.endHistory.mockResolvedValue(undefined);
  useWorld.setState({ trains: {}, localTrainId: null, regroups: 0 });
  useWorld.getState().addTrain({
    id: "local",
    owner: { name: "You", spriteUrl: "/characters/default.svg" },
    phase: "running",
    efficiency: 0.5,
    lane: 0,
  });
  useWorld.getState().setLocalTrainId("local");
  useEfficiency.getState().reset();
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
    historyId: null,
    departed: false,
  });
});

describe("startSession", () => {
  test("resets to station 0 in idle mode", () => {
    useStudySession.getState().startSession(plan);
    const s = useStudySession.getState();
    expect(s.plan).toBe(plan);
    expect(s.stationIndex).toBe(0);
    expect(s.mode).toBe("idle");
    expect(s.historyId).toBeNull();
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

  test("regeneration bypasses the remembered route without removing materials", async () => {
    addTwoMaterials();
    useMaterialLibrary.getState().setPlanId("old-light-route");
    apiMocks.createPlan.mockResolvedValue(plan);
    await useStudySession.getState().studyAll(true);
    expect(apiMocks.getPlan).not.toHaveBeenCalled();
    expect(apiMocks.createPlan).toHaveBeenCalledTimes(1);
    expect(useMaterialLibrary.getState().items).toHaveLength(2);
  });

  test("a saved sample route is regenerated instead of reused", async () => {
    addTwoMaterials();
    useMaterialLibrary.getState().setPlanId("sample");
    apiMocks.getPlan.mockResolvedValue({ ...plan, usedFallback: true });
    apiMocks.createPlan.mockResolvedValue(plan);
    await useStudySession.getState().studyAll();
    expect(apiMocks.createPlan).toHaveBeenCalledTimes(1);
    expect(useStudySession.getState().plan).toBe(plan);
  });

  test("sample content is shown but never remembered for reuse", async () => {
    addTwoMaterials();
    apiMocks.createPlan.mockResolvedValue({ ...plan, usedFallback: true });
    await useStudySession.getState().studyAll();
    expect(useStudySession.getState().plan?.usedFallback).toBe(true);
    expect(useMaterialLibrary.getState().planId).toBeNull();
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
  test("starts a countdown, says the departure line, and opens a history record on a fresh route", async () => {
    apiMocks.setTimer.mockResolvedValue({ minutes: 5, message: "Let's go" });
    useStudySession.getState().startSession(plan);

    await useStudySession.getState().startStudying();

    const s = useStudySession.getState();
    expect(s.mode).toBe("counting");
    expect(s.timerMessage).toBe("Let's go");
    expect(s.lastStretchMinutes).toBe(5);
    expect(s.timerEndsAt).not.toBeNull();
    expect(useConductorUi.getState().open).toBe(false);

    expect(speechOf()?.text).toBe(VOICE_LINES.startSession.text);
    expect(speechOf()?.audioUrl).toBe(VOICE_LINES.startSession.audioUrl);
    expect(s.historyId).toBe("h1");
    expect(historyMocks.startHistory).toHaveBeenCalledTimes(1);
    const call = historyMocks.startHistory.mock.calls[0]?.[0];
    expect(call?.planId).toBe(plan.id);
    expect(call?.stationTotal).toBe(plan.stations.length);
    expect(typeof call?.userId).toBe("string");
  });

  test("surfaces an error and does not change mode when the call fails", async () => {
    apiMocks.setTimer.mockRejectedValue(new Error("network down"));
    useStudySession.getState().startSession(plan);

    await useStudySession.getState().startStudying();

    const s = useStudySession.getState();
    expect(s.mode).toBe("idle");
    expect(s.error).toBeTruthy();
    expect(historyMocks.startHistory).not.toHaveBeenCalled();
  });

  test("does not reopen a history record for a departure that follows a passed station", async () => {
    apiMocks.setTimer.mockResolvedValue({ minutes: 5, message: "Next up" });
    useStudySession.getState().startSession(plan);
    useStudySession.setState({ historyId: "h1", departed: true });

    await useStudySession.getState().startStudying();

    expect(historyMocks.startHistory).not.toHaveBeenCalled();
    expect(useStudySession.getState().historyId).toBe("h1");
  });

  test("persists departed before the history POST resolves, so a reload cannot replay it", async () => {
    apiMocks.setTimer.mockResolvedValue({ minutes: 5, message: "Go" });
    let resolveStartHistory: (id: string | null) => void = () => {};
    historyMocks.startHistory.mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          resolveStartHistory = resolve;
        }),
    );
    useStudySession.getState().startSession(plan);

    const promise = useStudySession.getState().startStudying();

    // The mode change and `departed: true` are committed synchronously once
    // setTimer resolves, before startHistory's promise ever settles. Flush
    // with a macrotask so every already-resolved microtask (setTimer's
    // continuation included) has run first.
    await flush();
    expect(useStudySession.getState().mode).toBe("counting");
    expect(useStudySession.getState().departed).toBe(true);
    expect(useStudySession.getState().historyId).toBeNull();

    resolveStartHistory("h1");
    await promise;

    expect(useStudySession.getState().historyId).toBe("h1");
  });

  test("does not replay the departure after a history POST failure", async () => {
    apiMocks.setTimer.mockResolvedValue({ minutes: 5, message: "Go" });
    historyMocks.startHistory.mockResolvedValue(null);
    useStudySession.getState().startSession(plan);

    await useStudySession.getState().startStudying();

    expect(speechOf()?.text).toBe(VOICE_LINES.startSession.text);
    expect(useStudySession.getState().historyId).toBeNull();
    expect(useStudySession.getState().departed).toBe(true);
    expect(historyMocks.startHistory).toHaveBeenCalledTimes(1);

    // Reach the station and pass it: the next departure runs through the
    // same startStudying path and must not replay the line or the POST.
    useStudySession.setState({ mode: "counting", timerEndsAt: Date.now() - 1 });
    useStudySession.getState().tick();
    useStudySession.getState().chooseAnswer();
    useStudySession.getState().setAnswer("q1", { type: "mcq", choiceIndex: 1 });
    useStudySession.getState().setAnswer("q2", { type: "short", text: "because" });
    apiMocks.submitAnswer.mockResolvedValue({
      questionId: "irrelevant",
      score: 1,
      passed: true,
      feedback: "Correct.",
    });
    apiMocks.evaluateProgress.mockResolvedValue({ passed: true, feedback: "Nice." });

    await useStudySession.getState().submitAllAndFinish();

    expect(historyMocks.startHistory).toHaveBeenCalledTimes(1);
    expect(speechOf()?.text).toBe(VOICE_LINES.passQuiz.text);
  });
});

describe("tick", () => {
  test("stops the train and announces the arriving station once a study countdown elapses", () => {
    useStudySession.getState().startSession(plan);
    useStudySession.setState({ mode: "counting", timerEndsAt: Date.now() - 1 });

    useStudySession.getState().tick();
    applyStudyPhase();

    expect(useStudySession.getState().mode).toBe("at-station");
    expect(useWorld.getState().trains.local?.phase).toBe("stopped");
    expect(speechOf()?.text).toBe(`Now arriving: ${plan.stations[0]?.title}`);
    expect(speechOf()?.audioUrl).toBeUndefined();
  });

  test("a fresh arrival clears the last station's feedback and scores", () => {
    useStudySession.getState().startSession(plan);
    useStudySession.setState({
      mode: "counting",
      timerEndsAt: Date.now() - 1,
      stationFeedback: "Great work.",
      results: { q1: { questionId: "q1", score: 1, passed: true, feedback: "Correct." } },
    });

    useStudySession.getState().tick();

    expect(useStudySession.getState().stationFeedback).toBeNull();
    expect(useStudySession.getState().results).toEqual({});
  });

  test("returns to at-station and says the break is over once a break elapses", () => {
    useStudySession.getState().startSession(plan);
    useStudySession.setState({ mode: "on-break", timerEndsAt: Date.now() - 1 });

    useStudySession.getState().tick();
    applyStudyPhase();

    expect(useStudySession.getState().mode).toBe("at-station");
    expect(useWorld.getState().trains.local?.phase).toBe("stopped");
    expect(speechOf()?.text).toBe("Break's over.");
  });

  test("does nothing before the timer has elapsed", () => {
    useStudySession.getState().startSession(plan);
    useStudySession.setState({ mode: "counting", timerEndsAt: Date.now() + 60_000 });

    useStudySession.getState().tick();

    expect(useStudySession.getState().mode).toBe("counting");
  });
});

describe("chooseBreak", () => {
  test("says the take-break line", async () => {
    apiMocks.setTimer.mockResolvedValue({ minutes: 5, message: "Rest up" });
    useStudySession.getState().startSession(plan);

    await useStudySession.getState().chooseBreak();

    expect(useStudySession.getState().mode).toBe("on-break");
    expect(speechOf()?.text).toBe(VOICE_LINES.takeBreak.text);
  });
});

describe("chooseKeepStudying", () => {
  test("says the restart-study line", async () => {
    apiMocks.setTimer.mockResolvedValue({ minutes: 5, message: "Again" });
    useStudySession.getState().startSession(plan);
    useStudySession.setState({ mode: "at-station" });

    await useStudySession.getState().chooseKeepStudying();

    expect(useStudySession.getState().mode).toBe("counting");
    expect(speechOf()?.text).toBe(VOICE_LINES.restartStudy.text);
  });
});

describe("submitAllAndFinish", () => {
  function answerEverything() {
    useStudySession.getState().setAnswer("q1", { type: "mcq", choiceIndex: 1 });
    useStudySession.getState().setAnswer("q2", { type: "short", text: "because" });
  }

  test("advances and shows the result, but leaves the timer for the learner to start", async () => {
    apiMocks.submitAnswer.mockImplementation(async (_stationId, body: { questionId: string }) => ({
      questionId: body.questionId,
      score: body.questionId === "q1" ? 1 : 0.5,
      passed: true,
      feedback: "Correct.",
    }));
    apiMocks.evaluateProgress.mockResolvedValue({ passed: true, feedback: "Great work." });

    useStudySession.getState().startSession(plan);
    useStudySession.setState({ mode: "answering", historyId: "h1", departed: true });
    applyStudyPhase();
    answerEverything();

    await useStudySession.getState().submitAllAndFinish();

    const s = useStudySession.getState();
    expect(s.stationIndex).toBe(1);
    expect(s.mode).toBe("passed");
    expect(s.stationFeedback).toBe("Great work.");
    expect(s.results.q1?.feedback).toBe("Correct.");
    // Still parked: nothing has started the next station's timer yet.
    expect(useWorld.getState().trains.local?.phase).toBe("stopped");

    apiMocks.setTimer.mockResolvedValue({ minutes: 8, message: "Next up" });
    await useStudySession.getState().startStudying();

    expect(useStudySession.getState().mode).toBe("counting");
    applyStudyPhase();
    expect(useWorld.getState().trains.local?.phase).toBe("running");

    expect(useEfficiency.getState().signals.quiz?.value).toBeCloseTo(0.75, 6);
    expect(historyMocks.recordHistory).toHaveBeenCalledWith("h1", {
      stationIndex: 0,
      stationId: "s1",
      passed: true,
      meanScore: 0.75,
    });

    // startStudying ran for the next station but the history record was
    // already open, so the pass line is still the one showing.
    expect(speechOf()?.text).toBe(VOICE_LINES.passQuiz.text);
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
    useStudySession.setState({ mode: "answering", historyId: "h1" });
    answerEverything();

    await useStudySession.getState().submitAllAndFinish();

    const s = useStudySession.getState();
    expect(s.stationIndex).toBe(0);
    expect(s.mode).toBe("at-station");
    expect(s.stationFeedback).toBe("Try again.");
    expect(historyMocks.recordHistory).toHaveBeenCalledWith("h1", {
      stationIndex: 0,
      stationId: "s1",
      passed: false,
      meanScore: 0,
    });
    expect(s.results.q1?.feedback).toBe("Not quite.");
  });

  test("says the great-session line, finishes, and ends history as completed after the last station passes", async () => {
    apiMocks.submitAnswer.mockResolvedValue({
      questionId: "q3",
      score: 1,
      passed: true,
      feedback: "Correct.",
    });
    apiMocks.evaluateProgress.mockResolvedValue({ passed: true, feedback: "All done." });

    useStudySession.getState().startSession(plan);
    useStudySession.setState({ stationIndex: 1, mode: "answering", historyId: "h1" });
    useStudySession.getState().setAnswer("q3", { type: "mcq", choiceIndex: 0 });

    await useStudySession.getState().submitAllAndFinish();

    expect(useStudySession.getState().mode).toBe("complete");
    applyStudyPhase();
    expect(useWorld.getState().trains.local?.phase).toBe("finished");
    expect(speechOf()?.text).toBe(VOICE_LINES.greatSession.text);
    expect(historyMocks.endHistory).toHaveBeenCalledWith("h1", "completed");
    expect(historyMocks.recordHistory).toHaveBeenCalledWith("h1", {
      stationIndex: 1,
      stationId: "s2",
      passed: true,
      meanScore: 1,
    });
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
    applyStudyPhase();

    expect(useStudySession.getState().mode).toBe("at-station");
    expect(useStudySession.getState().timerEndsAt).toBeNull();
    expect(useWorld.getState().trains.local?.phase).toBe("stopped");
  });

  test("ends a break early back at the station", () => {
    useStudySession.getState().startSession(plan);
    useStudySession.setState({ mode: "on-break", timerEndsAt: Date.now() + 5 * 60_000 });

    useStudySession.getState().skipTimer();
    applyStudyPhase();

    expect(useStudySession.getState().mode).toBe("at-station");
  });

  test("does nothing when no countdown is running", () => {
    useStudySession.getState().startSession(plan);

    useStudySession.getState().skipTimer();
    applyStudyPhase();

    expect(useStudySession.getState().mode).toBe("idle");
    expect(useWorld.getState().trains.local?.phase).toBe("stopped");
  });
});

describe("quit", () => {
  test("clears the session, parks the train, and ends history as quit", () => {
    useStudySession.getState().startSession(plan);
    useStudySession.setState({ mode: "at-station", historyId: "h1" });

    useStudySession.getState().quit();

    const s = useStudySession.getState();
    expect(s.plan).toBeNull();
    expect(s.mode).toBe("idle");
    expect(historyMocks.endHistory).toHaveBeenCalledWith("h1", "quit");
    applyStudyPhase();
    expect(useWorld.getState().trains.local?.phase).toBe("stopped");
  });

  test("does not end history when quitting after completion", () => {
    useStudySession.getState().startSession(plan);
    useStudySession.setState({ mode: "complete", historyId: "h1" });

    useStudySession.getState().quit();

    expect(historyMocks.endHistory).not.toHaveBeenCalled();
  });
});

describe("fresh sessions and pending requests", () => {
  test("refresh discards the saved route and timer and closes its history once", async () => {
    localStorage.setItem(
      "grugchug.conductor.session",
      JSON.stringify({
        planId: "old-plan",
        stationIndex: 1,
        mode: "counting",
        timerEndsAt: Date.now() + 60000,
        historyId: "old-history",
      }),
    );
    localStorage.setItem("grugchug.conductor.library", "keep materials");
    await Promise.all([useStudySession.getState().hydrate(), useStudySession.getState().hydrate()]);
    expect(useStudySession.getState()).toMatchObject({
      mode: "idle",
      plan: null,
      timerEndsAt: null,
    });
    expect(apiMocks.getPlan).not.toHaveBeenCalled();
    expect(historyMocks.endHistory).toHaveBeenCalledTimes(1);
    expect(historyMocks.endHistory).toHaveBeenCalledWith("old-history", "quit");
    expect(localStorage.getItem("grugchug.conductor.session")).toBeNull();
    expect(localStorage.getItem("grugchug.conductor.library")).toBe("keep materials");
  });

  test("break speaks before the timer responds, and quit prevents the late response restarting it", async () => {
    let resolve = (_value: { minutes: number; message: string }) => {};
    apiMocks.setTimer.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    useStudySession.getState().startSession(plan);
    useStudySession.setState({ mode: "at-station", historyId: "h1" });
    const pending = useStudySession.getState().chooseBreak();
    expect(speechOf()?.audioUrl).toBe(VOICE_LINES.takeBreak.audioUrl);
    useStudySession.getState().quit();
    expect(speechOf()?.audioUrl).toBe(VOICE_LINES.greatSession.audioUrl);
    resolve({ minutes: 5, message: "Rest" });
    await pending;
    expect(useStudySession.getState()).toMatchObject({
      mode: "idle",
      plan: null,
      timerEndsAt: null,
    });
    expect(speechOf()?.audioUrl).toBe(VOICE_LINES.greatSession.audioUrl);
    expect(localStorage.getItem("grugchug.conductor.session")).toBeNull();
  });

  test("a late timer error cannot repopulate a quit session", async () => {
    let reject = (_error: Error) => {};
    apiMocks.setTimer.mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    useStudySession.getState().startSession(plan);
    const pending = useStudySession.getState().startStudying();
    useStudySession.getState().quit();
    reject(new Error("network failed"));
    await pending;
    expect(useStudySession.getState()).toMatchObject({ mode: "idle", error: null, busy: false });
  });

  test("a history record created after quitting is closed without restoring session state", async () => {
    let resolve = (_id: string) => {};
    apiMocks.setTimer.mockResolvedValue({ minutes: 10, message: "Go" });
    historyMocks.startHistory.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    useStudySession.getState().startSession(plan);
    const pending = useStudySession.getState().startStudying();
    await flush();
    useStudySession.getState().quit();
    resolve("late-history");
    await pending;
    expect(historyMocks.endHistory).toHaveBeenCalledWith("late-history", "quit");
    expect(useStudySession.getState()).toMatchObject({ plan: null, historyId: null });
  });
});
