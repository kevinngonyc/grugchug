// The study session state machine: upload → timer → station → answer or
// keep studying or break → next station. The mode is the one source of
// truth for the local train's phase (see study-drive.ts, which projects it)
// and for what the conductor says (features/speech); efficiency-driven speed
// is the only thing exclusively owned by features/session.
//
// Refresh starts a fresh sitting. Saved metadata is only used to close the
// previous history record; it never restores a route or timer automatically.
import type {
  Answer,
  AnswerResult,
  ProgressResult,
  PublicRoutePlan,
  PublicStation,
} from "@grugchug/shared";
import { create } from "zustand";
import { useEfficiency } from "@/features/efficiency";
import { sayLine, sayText } from "@/features/speech";
import { getUserId } from "@/lib/user-id";
import { createPlan, evaluateProgress, getPlan, setTimer, submitAnswer } from "./api";
import { endHistory, recordHistory, startHistory } from "./history";
import { useMaterialLibrary } from "./material-library";
import { clearSession, readSession, writeSession } from "./session-storage";
import { useConductorUi } from "./store";

// Quiz results are one more opinion about how the sitting is going: half the
// pull of attention, fading over ten minutes so a bad station is not forever.
const QUIZ_SOURCE = "quiz";
const QUIZ_WEIGHT = 0.5;
const QUIZ_HALF_LIFE_MS = 10 * 60_000;

export type SessionMode =
  | "idle" // no plan, or a plan not yet started
  | "counting" // timer running, train travelling toward the next station
  | "on-break" // timer running, train stays put
  | "at-station" // train stopped, choose answer / keep studying / break
  | "answering" // showing this station's questions
  | "passed" // graded, passed, more stations left: showing the result before moving on
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
  historyId: string | null;
  departed: boolean;
  /**
   * Study time left when a break was taken mid-stretch; the stretch resumes
   * with this much once the break ends. Null for a break taken at a station.
   */
  pausedStudyMs: number | null;

  hydrate: () => Promise<void>;
  startSession: (plan: PublicRoutePlan) => void;
  studyAll: (regenerate?: boolean) => Promise<void>;
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
    historyId: state.historyId,
    departed: state.departed,
  });
}

function answerGivenText(station: PublicStation, questionId: string, answer: Answer): string {
  if (answer.type === "short") return answer.text;
  const question = station.questions.find((q) => q.id === questionId);
  if (answer.type === "mcq") {
    return question?.type === "mcq" ? (question.choices[answer.choiceIndex] ?? "") : "";
  }
  if (question?.type !== "multi") return "";
  return answer.choiceIndices
    .map((i) => question.choices[i])
    .filter((choice): choice is string => choice !== undefined)
    .join(", ");
}

// Invalidates outstanding API work when a run ends or a new route starts.
let sessionRevision = 0;

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
  historyId: null,
  departed: false,
  pausedStudyMs: null,

  hydrate: async () => {
    if (get().plan) return; // A route remount in the same page keeps the live run.
    const saved = readSession();
    clearSession(); // Clear before awaiting, including StrictMode's second effect.
    if (saved?.historyId && saved.mode !== "complete") {
      await endHistory(saved.historyId, "quit").catch(() => undefined);
    }
  },

  startSession: (plan) => {
    sessionRevision++;
    useEfficiency.getState().drop(QUIZ_SOURCE);
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
      historyId: null,
      departed: false,
      pausedStudyMs: null,
    });
    persist(get());
  },

  // One route over everything in the library. A route already built from this
  // exact set is refetched by id rather than regenerated (never trusted
  // stale); if it is gone — expired, deleted server-side — fall back to
  // generating instead of showing an error the learner can't act on.
  studyAll: async (regenerate = false) => {
    const revision = sessionRevision;
    const library = useMaterialLibrary.getState();
    if (library.items.length === 0 || get().busy) return;

    set({ busy: true, error: null });
    try {
      let plan: PublicRoutePlan | null = null;
      if (library.planId && !regenerate) {
        plan = await getPlan(library.planId).catch(() => null);
      }
      if (revision !== sessionRevision) return;
      if (!plan || plan.usedFallback) {
        plan = await createPlan({
          userId: getUserId(),
          materials: library.items.map((item) => item.material),
        });
        if (revision !== sessionRevision) return;
        useMaterialLibrary.getState().setPlanId(plan.usedFallback ? null : plan.id);
      }
      get().startSession(plan);
    } catch (error) {
      if (revision !== sessionRevision) return;
      // The API says why ("AI provider unavailable: GROQ_FLASH_MODEL is not
      // set"); a network failure has nothing better than the generic line.
      // Matched by name, not instanceof, so this module needs only ./api's
      // functions.
      const reason =
        error instanceof Error && error.name === "ConductorApiError" ? error.message : null;
      set({
        busy: false,
        error: reason ?? "Could not build a route from your materials. Try again.",
      });
    }
  },

  startStudying: async () => {
    const revision = sessionRevision;
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
      if (revision !== sessionRevision) return;
      // `departed` is persisted immediately, in the same set as the mode
      // change, rather than after the history POST below: a reload during
      // that POST must not find `departed: false` and replay the
      // all-aboard line or open a second history record.
      set({
        mode: "counting",
        timerEndsAt: Date.now() + minutes * 60_000,
        timerMessage: message,
        lastStretchMinutes: minutes,
        busy: false,
        departed: true,
      });
      persist(get());
      useConductorUi.getState().closePanel();

      // A fresh route departs with the all-aboard line and opens its history
      // record; a departure after a passed station stays quiet, the pass line
      // is still playing. `state.departed` is the pre-call snapshot, so this
      // still gates on whether this is the first departure. The timer and the
      // panel are already committed above, so a slow (or failing) history
      // POST here cannot hold up the UI; a failed start leaves `historyId`
      // null but `departed` is already true and stays true.
      if (!state.departed) {
        sayLine("startSession");
        const historyId = await startHistory({
          userId: getUserId(),
          planId: state.plan.id,
          stationTotal: state.plan.stations.length,
        });
        if (revision !== sessionRevision) {
          await endHistory(historyId, "quit").catch(() => undefined);
          return;
        }
        set({ historyId });
        persist(get());
      }
    } catch {
      if (revision !== sessionRevision) return;
      set({ busy: false, error: "Could not start the timer. Try again." });
    }
  },

  tick: () => {
    const state = get();
    if (state.timerEndsAt === null || Date.now() < state.timerEndsAt) return;

    if (state.mode === "counting") {
      const station = currentStation(state);
      if (station) sayText(`Now arriving: ${station.title}`);
      // A fresh arrival, not a return from grading: last station's feedback
      // and scores no longer describe anything on screen.
      set({
        mode: "at-station",
        timerEndsAt: null,
        timerMessage: null,
        stationFeedback: null,
        results: {},
      });
      persist(get());
    } else if (state.mode === "on-break") {
      // A break taken mid-stretch picks the stretch up where it stopped; one
      // taken at a station returns to the station.
      if (state.pausedStudyMs !== null) {
        sayLine("restartStudy");
        set({
          mode: "counting",
          timerEndsAt: Date.now() + state.pausedStudyMs,
          timerMessage: "Break's over — back to studying.",
          pausedStudyMs: null,
        });
      } else {
        sayText("Break's over.");
        set({ mode: "at-station", timerEndsAt: null, timerMessage: null });
      }
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
    const revision = sessionRevision;
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
      if (revision !== sessionRevision) return;
      set({
        mode: "counting",
        timerEndsAt: Date.now() + minutes * 60_000,
        timerMessage: message,
        lastStretchMinutes: minutes,
        busy: false,
      });
      sayLine("restartStudy");
      persist(get());
      useConductorUi.getState().closePanel();
    } catch {
      if (revision !== sessionRevision) return;
      set({ busy: false, error: "Could not restart the timer. Try again." });
    }
  },

  chooseBreak: async () => {
    const revision = sessionRevision;
    const state = get();
    if (!state.plan || state.busy) return;
    set({ busy: true, error: null });
    // Respond within the click gesture, before the model chooses a duration.
    sayLine("takeBreak");
    try {
      const { minutes, message } = await setTimer({
        planId: state.plan.id,
        reason: "break",
        previousMinutes: state.lastStretchMinutes ?? undefined,
      });
      if (revision !== sessionRevision) return;
      // Measured when the break actually starts, not at the click: the study
      // timer kept running while the model chose a length.
      const current = get();
      const pausedStudyMs =
        current.mode === "counting" && current.timerEndsAt !== null
          ? Math.max(0, current.timerEndsAt - Date.now())
          : null;
      set({
        mode: "on-break",
        timerEndsAt: Date.now() + minutes * 60_000,
        timerMessage: message,
        busy: false,
        pausedStudyMs,
      });
      persist(get());
    } catch {
      if (revision !== sessionRevision) return;
      set({ busy: false, error: "Could not start a break. Try again." });
    }
  },

  setAnswer: (questionId, answer) => {
    set((s) => ({ answers: { ...s.answers, [questionId]: answer } }));
  },

  submitAllAndFinish: async () => {
    const revision = sessionRevision;
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
      if (revision !== sessionRevision) return;
      results = Object.fromEntries(graded);
      set({ results });
    } catch {
      if (revision !== sessionRevision) return;
      set({ busy: false, error: "Could not submit your answers. Try again." });
      return;
    }

    const scores = station.questions.map((q) => results[q.id]?.score ?? 0);
    const meanScore = scores.reduce((sum, s) => sum + s, 0) / Math.max(1, scores.length);
    useEfficiency.getState().report(QUIZ_SOURCE, meanScore, {
      label: "Quiz",
      weight: QUIZ_WEIGHT,
      halfLifeMs: QUIZ_HALF_LIFE_MS,
    });

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

      if (revision !== sessionRevision) return;

      // Fire and forget: a hung API must never delay the verdict on screen.
      recordHistory(state.historyId, {
        stationIndex: state.stationIndex,
        stationId: station.id,
        passed,
        meanScore,
      });

      if (!passed) {
        set({ mode: "at-station", stationFeedback: feedback, busy: false });
        persist(get());
        return;
      }

      const nextIndex = state.stationIndex + 1;
      if (nextIndex >= state.plan.stations.length) {
        sayLine("greatSession");
        // Fire and forget: the completion screen must not wait on the network.
        endHistory(state.historyId, "completed");
        set({ mode: "complete", stationFeedback: feedback, busy: false });
        persist(get());
        return;
      }

      sayLine("passQuiz");
      // Passed, and stations remain: show the result — this station's
      // per-question scores are still in `results` — rather than racing on
      // to the next timer before the learner ever sees them. The train stays
      // stopped; `startStudying` (called once they continue) is what departs
      // it, same as any other station-to-station move.
      set({ stationIndex: nextIndex, mode: "passed", stationFeedback: feedback, busy: false });
      persist(get());
    } catch {
      if (revision !== sessionRevision) return;
      set({ busy: false, error: "Could not check your answers. Try again." });
    }
  },

  quit: () => {
    const { historyId, mode, plan } = get();
    sessionRevision++;
    if (plan && mode !== "complete") sayLine("greatSession");
    useConductorUi.getState().closePanel();
    useEfficiency.getState().drop(QUIZ_SOURCE);
    if (mode !== "complete") {
      // Fire and forget: quitting must be instant even with the API down.
      endHistory(historyId, "quit").catch(() => undefined);
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
      historyId: null,
      departed: false,
      pausedStudyMs: null,
    });
  },
}));
