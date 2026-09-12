// The score itself, as pure arithmetic. No React, no store, no clock of its
// own — every function takes `now` — so the blend and the decay can be tested
// without a session, a webcam, or a timer.
import type { EfficiencySignal } from "@grugchug/shared";
import {
  EFFICIENCY_SCORE_MAX,
  EFFICIENCY_SCORE_MIN,
  EFFICIENCY_SCORE_NEUTRAL,
} from "@grugchug/shared";

// Below this share of its original weight a signal is treated as gone rather
// than as a whisper: a quiz from an hour ago should not still be nudging the
// train. 1/64 is six half-lives.
export const STALE_WEIGHT_FLOOR = 1 / 64;

/**
 * What a signal still counts for at `now`. A reading loses half its weight
 * every `halfLifeMs`; one with no half-life counts in full forever. Readings
 * from the future (a clock that jumped) count in full rather than more.
 */
export function effectiveWeight(signal: EfficiencySignal, now: number): number {
  if (signal.halfLifeMs === null) return signal.weight;

  const ageMs = now - signal.updatedAt;
  if (ageMs <= 0) return signal.weight;

  const decay = 2 ** (-ageMs / signal.halfLifeMs);
  return decay < STALE_WEIGHT_FLOOR ? 0 : signal.weight * decay;
}

/**
 * The weighted mean of everything still reporting, on the 0..100 scale.
 * `null` when nothing is: that is "we do not know yet", which is different
 * from a score of zero, and the caller decides what to show instead.
 */
export function scoreOf(signals: readonly EfficiencySignal[], now: number): number | null {
  let weighted = 0;
  let total = 0;

  for (const signal of signals) {
    const weight = effectiveWeight(signal, now);
    if (weight <= 0) continue;
    weighted += clamp01(signal.value) * weight;
    total += weight;
  }

  if (total <= 0) return null;

  const score = (weighted / total) * EFFICIENCY_SCORE_MAX;
  return Math.min(EFFICIENCY_SCORE_MAX, Math.max(EFFICIENCY_SCORE_MIN, score));
}

/** The score, with the "nothing has reported yet" case filled in. */
export function scoreOrNeutral(signals: readonly EfficiencySignal[], now: number): number {
  return scoreOf(signals, now) ?? EFFICIENCY_SCORE_NEUTRAL;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
