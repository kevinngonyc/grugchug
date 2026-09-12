// Where the score lives. Sources report into it, everything else reads it.
//
// The store keeps one signal per source and a `score` recomputed on every
// change, so readers (the train, a dashboard, a future agent) never have to
// know the blend exists — they read one number.
import type { EfficiencySignal } from "@grugchug/shared";
import { EFFICIENCY_SCORE_MAX } from "@grugchug/shared";
import { create } from "zustand";
import { ATTENTION_HALF_LIFE_MS, foldAttention } from "./attention";
import { clamp01, scoreOrNeutral } from "./score";

/** The source id the webcam reports under. */
export const ATTENTION_SOURCE = "attention";

// Attention is the baseline every other weight is read against, so it is 1.
// It reports several times a second, which means its half-life only matters
// when reporting stops: a tracker that dies fades out instead of freezing the
// score at whatever it last saw.
export const ATTENTION_WEIGHT = 1;
export const ATTENTION_STALE_HALF_LIFE_MS = 120_000;

export interface ReportOptions {
  /** Shown in debug panels and summaries. Defaults to the source id. */
  label?: string;
  /** Relative to attention's 1. Defaults to the signal's current weight, or 1. */
  weight?: number;
  /** Half-life of the reading in ms, or null to never go stale. Default: null. */
  halfLifeMs?: number | null;
  /** When the reading was taken. Defaults to now. */
  at?: number;
}

export type EfficiencyState = {
  signals: Record<string, EfficiencySignal>;
  /** The study efficiency score, 0..100. This is the number to read. */
  score: number;

  /** Report what a source currently thinks of the session, 0..1. */
  report: (source: string, value: number, options?: ReportOptions) => void;
  /** Fold one "are they facing the screen" observation into attention. */
  reportAttention: (facing: boolean, at?: number) => void;
  /** Stop counting a source. */
  drop: (source: string, at?: number) => void;
  /** Recompute as readings age. Nothing else changes. */
  tick: (at?: number) => void;
  /** Forget everything — a new sitting starts from neutral. */
  reset: () => void;
};

function recompute(
  signals: Record<string, EfficiencySignal>,
  at: number,
): EfficiencyState["score"] {
  return scoreOrNeutral(Object.values(signals), at);
}

export const useEfficiency = create<EfficiencyState>()((set, get) => ({
  signals: {},
  score: scoreOrNeutral([], Date.now()),

  report: (source, value, options = {}) => {
    const at = options.at ?? Date.now();
    set((s) => {
      const previous = s.signals[source];
      const signal: EfficiencySignal = {
        source,
        label: options.label ?? previous?.label ?? source,
        value: clamp01(value),
        weight: positiveWeight(options.weight ?? previous?.weight),
        halfLifeMs: options.halfLifeMs ?? previous?.halfLifeMs ?? null,
        updatedAt: at,
      };
      const signals = { ...s.signals, [source]: signal };
      return { signals, score: recompute(signals, at) };
    });
  },

  reportAttention: (facing, at = Date.now()) => {
    const previous = get().signals[ATTENTION_SOURCE];
    const elapsedMs = previous ? at - previous.updatedAt : 0;
    const value = foldAttention(previous?.value ?? null, facing, elapsedMs, ATTENTION_HALF_LIFE_MS);

    get().report(ATTENTION_SOURCE, value, {
      label: "Eyes on screen",
      weight: ATTENTION_WEIGHT,
      halfLifeMs: ATTENTION_STALE_HALF_LIFE_MS,
      at,
    });
  },

  drop: (source, at = Date.now()) =>
    set((s) => {
      if (!s.signals[source]) return {};
      const signals = { ...s.signals };
      delete signals[source];
      return { signals, score: recompute(signals, at) };
    }),

  tick: (at = Date.now()) => set((s) => ({ score: recompute(s.signals, at) })),

  reset: () => set({ signals: {}, score: scoreOrNeutral([], Date.now()) }),
}));

function positiveWeight(weight: number | undefined): number {
  return typeof weight === "number" && Number.isFinite(weight) && weight > 0 ? weight : 1;
}

/** The score for callers outside React — an agent, a timer, a plain module. */
export function efficiencyScore(): number {
  return useEfficiency.getState().score;
}

/** The score as a 0..1 fraction, which is what a train's `efficiency` is. */
export function efficiencyFraction(): number {
  return efficiencyScore() / EFFICIENCY_SCORE_MAX;
}

/** Report attention without reaching into the store. Stable across renders. */
export function reportAttention(facing: boolean): void {
  useEfficiency.getState().reportAttention(facing);
}
