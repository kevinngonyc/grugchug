// The study session state machine: upload → timer → station → answer or
// keep studying or break → next station. Owns the one place features/scene
// is written from outside features/session — calling setPhase to stop the
// train at a station is a world command like any other, the same one the
// dev panel already calls by hand; efficiency-driven speed is the only
// thing exclusively owned by features/session.
//
// The plan itself is never persisted — only enough to resume is kept in
// localStorage (see session-storage.ts), and the plan is refetched by id on
// load, so a stale copy can never be shown.
import type {
  Answer,
  AnswerResult,
  ProgressResult,
  PublicRoutePlan,
  PublicStation,
} from "@grugchug/shared";
import { create } from "zustand";
import { useWorld } from "@/features/world";
import { getUserId } from "@/lib/user-id";
import { createPlan, evaluateProgress, getPlan, setTimer, submitAnswer } from "./api";
import { useMaterialLibrary } from "./material-library";
import { clearSession, readSession, writeSession } from "./session-storage";
import { useConductorUi } from "./store";

export type SessionMode =
  | "idle" // no plan, or a plan not yet started
  | "counting" // timer running, train travelling toward the next station
  | "on-break" // timer running, train stays put
  | "at-station" // train stopped, choose answer / keep studying / break
  | "answering" // showing this station's questions
  | "complete"; // every station passed

interface StudySessionState {
  plan: PublicRoutePlan | null;
  stationIndex: number;
  mode: SessionMode;
  timerEndsAt: number | null;
  timerMessage: string | null;
  lastStretchMinutes: number | null;
  answers: Record<string, Answer>;
  results: Record<string, AnswerResult>;
  stationFeedback: string | null;
  busy: boolean;
  error: string | null;

  hydrate: () => Promise<void>;
  startSession: (plan: PublicRoutePlan) => void;
  studyAll: () => Promise<void>;
  startStudying: () => Promise<void>;
  tick: () => void;
  skipTimer: () => void;
  chooseAnswer: () => void;
  chooseKeepStudying: () => Promise<void>;
  chooseBreak: () => Promise<void>;
  setAnswer: (questionId: string, answer: Answer) => void;
  submitAllAndFinish: () => Promise<void>;
  quit: () => void;
}

function currentStation(state: StudySessionState): PublicStation | undefined {
  return state.plan?.stations[state.stationIndex];
}

function localTrainId(): string | null {
  return useWorld.getState().localTrainId;
}

function persist(state: StudySessionState): void {
  if (!state.plan) {
    clearSession();
    return;
  }
  writeSession({
    planId: state.plan.id,
    stationIndex: state.stationIndex,
    mode: state.mode,
    timerEndsAt: state.timerEndsAt,
    timerMessage: state.timerMessage,
    lastStretchMinutes: state.lastStretchMinutes,
  });
}

function answerGivenText(station: PublicStation, questionId: string, answer: Answer): string {
  if (answer.type === "short") return answer.text;
  const question = station.questions.find((q) => q.id === questionId);
  return question?.type === "mcq" ? (question.choices[answer.choiceIndex] ?? "") : "";
}

export const useStudySession = create<StudySessionState>()((set, get) => ({
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

  hydrate: async () => {
    const saved = readSession();
    if (!saved) return;
    try {
      const plan = await getPlan(saved.planId);
      set({
        plan,
        stationIndex: saved.stationIndex,
        mode: saved.mode,
        timerEndsAt: saved.timerEndsAt,
        timerMessage: saved.timerMessage,
        lastStretchMinutes: saved.lastStretchMinutes,
      });
    } catch {
      // The plan is gone or unreachable: behave like there is nothing to resume.
      clearSession();
    }
  },

  startSession: (plan) => {
    set({
      plan,
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
    persist(get());
  },

  // One route over everything in the library. A route already built from this
  // exact set is refetched by id rather than regenerated (never trusted
  // stale); if it is gone — expired, deleted server-side — fall back to
  // generating instead of showing an error the learner can't act on.
  studyAll: async () => {
    const library = useMaterialLibrary.getState();
    if (library.items.length === 0) return;

    set({ busy: true, error: null });
    try {
      let plan: PublicRoutePlan | null = null;
      if (library.planId) {
        plan = await getPlan(library.planId).catch(() => null);
      }
      if (!plan) {
        plan = await createPlan({
          userId: getUserId(),
          materials: library.items.map((item) => item.material),
        });
        useMaterialLibrary.getState().setPlanId(plan.id);
      }
      get().startSession(plan);
    } catch {
      set({ busy: false, error: "Could not build a route from your materials. Try again." });
    }
  },

  startStudying: async () => {
    const state = get();
    const station = currentStation(state);
    if (!state.plan || !station) return;
    set({ busy: true, error: null });
    try {
      const { minutes, message } = await setTimer({
        planId: state.plan.id,
        stationId: station.id,
        reason: "study",
      });
      set({
        mode: "counting",
        timerEndsAt: Date.now() + minutes * 60_000,
        timerMessage: message,
        lastStretchMinutes: minutes,
        busy: false,
      });
      persist(get());
      useConductorUi.getState().closePanel();
    } catch {
      set({ busy: false, error: "Could not start the timer. Try again." });
    }
  },

  tick: () => {
    const state = get();
    if (state.timerEndsAt === null || Date.now() < state.timerEndsAt) return;

    if (state.mode === "counting") {
      const id = localTrainId();
      if (id) useWorld.getState().setPhase(id, "stopped");
      set({ mode: "at-station", timerEndsAt: null, timerMessage: null });
      persist(get());
    } else if (state.mode === "on-break") {
      set({ mode: "at-station", timerEndsAt: null, timerMessage: null });
      persist(get());
    }
  },

  // Dev panel only: end the running countdown now instead of in however many
  // real minutes the model chose, through the same tick a timer that ran out
  // takes — so a station and its quiz can be tried without waiting one out.
  skipTimer: () => {
    const { mode } = get();
    if (mode !== "counting" && mode !== "on-break") return;
    set({ timerEndsAt: Date.now() });
    get().tick();
  },

  chooseAnswer: () => {
    set({ mode: "answering", answers: {}, results: {}, stationFeedback: null });
    persist(get());
  },

  chooseKeepStudying: async () => {
    const state = get();
    const station = currentStation(state);
    if (!state.plan || !station) return;
    set({ busy: true, error: null });
    try {
      const { minutes, message } = await setTimer({
        planId: state.plan.id,
        stationId: station.id,
        reason: "keep-studying",
      });
      const id = localTrainId();
      if (id) useWorld.getState().setPhase(id, "running");
      set({
        mode: "counting",
        timerEndsAt: Date.now() + minutes * 60_000,
        timerMessage: message,
        lastStretchMinutes: minutes,
        busy: false,
      });
      persist(get());
      useConductorUi.getState().closePanel();
    } catch {
      set({ busy: false, error: "Could not restart the timer. Try again." });
    }
  },

  chooseBreak: async () => {
    const state = get();
    if (!state.plan) return;
    set({ busy: true, error: null });
    try {
      const { minutes, message } = await setTimer({
        planId: state.plan.id,
        reason: "break",
        previousMinutes: state.lastStretchMinutes ?? undefined,
      });
      set({
        mode: "on-break",
        timerEndsAt: Date.now() + minutes * 60_000,
        timerMessage: message,
        busy: false,
      });
      persist(get());
    } catch {
      set({ busy: false, error: "Could not start a break. Try again." });
    }
  },

  setAnswer: (questionId, answer) => {
    set((s) => ({ answers: { ...s.answers, [questionId]: answer } }));
  },

  submitAllAndFinish: async () => {
    const state = get();
    const station = currentStation(state);
    if (!state.plan || !station) return;
    const planId = state.plan.id;

    const unanswered = station.questions.some((q) => !state.answers[q.id]);
    if (unanswered) {
      set({ error: "Answer every question before submitting." });
      return;
    }

    set({ busy: true, error: null });

    let results: Record<string, AnswerResult>;
    try {
      const graded = await Promise.all(
        station.questions.map(async (q) => {
          const answer = state.answers[q.id];
          if (!answer) throw new Error("missing answer");
          const result = await submitAnswer(station.id, { planId, questionId: q.id, answer });
          return [q.id, result] as const;
        }),
      );
      results = Object.fromEntries(graded);
      set({ results });
    } catch {
      set({ busy: false, error: "Could not submit your answers. Try again." });
      return;
    }

    const progress: ProgressResult[] = station.questions.map((q) => {
      const answer = state.answers[q.id];
      const result = results[q.id];
      return {
        questionId: q.id,
        prompt: q.prompt,
        answerGiven: answer ? answerGivenText(station, q.id, answer) : "",
        score: result?.score ?? 0,
        feedback: result?.feedback ?? "",
      };
    });

    try {
      const { passed, feedback } = await evaluateProgress(station.id, {
        planId,
        results: progress,
      });

      if (!passed) {
        set({ mode: "at-station", stationFeedback: feedback, busy: false });
        persist(get());
        return;
      }

      const nextIndex = state.stationIndex + 1;
      const id = localTrainId();
      if (nextIndex >= state.plan.stations.length) {
        if (id) useWorld.getState().setPhase(id, "running");
        set({ mode: "complete", stationFeedback: feedback, busy: false });
        persist(get());
        return;
      }

      if (id) useWorld.getState().setPhase(id, "running");
      const nextStation = state.plan.stations[nextIndex];
      set({ stationIndex: nextIndex, stationFeedback: feedback, busy: false });
      if (nextStation) await get().startStudying();
    } catch {
      set({ busy: false, error: "Could not check your answers. Try again." });
    }
  },

  quit: () => {
    const id = localTrainId();
    if (id && useWorld.getState().trains[id]?.phase === "stopped") {
      useWorld.getState().setPhase(id, "running");
    }
    clearSession();
    set({
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
  },
}));
