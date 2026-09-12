// Study efficiency: one 0..100 score for how well a sitting is going.
//
// It is a weighted blend, not a measurement. Any source that learns something
// about the session reports a 0..1 opinion and a weight, and the score is
// their weighted mean:
//
//   useEfficiency.getState().report("quiz", 0.8, {
//     label: "Quiz", weight: 0.5, halfLifeMs: 10 * 60_000,
//   });
//
// Weights are read against attention's 1, so that quiz can move the score by
// at most a third of the way to its own value, and its half-life makes it
// fade as it ages. Readers take the number and nothing else: `efficiencyScore()`
// outside React, `useEfficiency((s) => s.score)` inside it. Train speed is the
// first reader; a dashboard, a session summary, or an agent can be the next
// without this feature knowing.
//
// No React and no webcam below this line: `score.ts` and `attention.ts` are
// pure, and the store is the only stateful piece.

export type { EfficiencySignal } from "@grugchug/shared";
export {
  EFFICIENCY_SCORE_MAX,
  EFFICIENCY_SCORE_MIN,
  EFFICIENCY_SCORE_NEUTRAL,
} from "@grugchug/shared";
export { ATTENTION_HALF_LIFE_MS, foldAttention } from "./attention";
export { clamp01, effectiveWeight, STALE_WEIGHT_FLOOR, scoreOf, scoreOrNeutral } from "./score";
export {
  ATTENTION_SOURCE,
  ATTENTION_STALE_HALF_LIFE_MS,
  ATTENTION_WEIGHT,
  type EfficiencyState,
  efficiencyFraction,
  efficiencyScore,
  type ReportOptions,
  reportAttention,
  useEfficiency,
} from "./store";
