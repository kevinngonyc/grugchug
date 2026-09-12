import { z } from "zod";

// The study efficiency score: one number, 0..100, for how well a sitting is
// going. It is a weighted blend of signals rather than a single measurement,
// so anything that learns something about the session — attention from the
// webcam, a quiz result, a typing streak — can report into it without the
// other sources having to know.
export const EFFICIENCY_SCORE_MIN = 0;
export const EFFICIENCY_SCORE_MAX = 100;

// What the score reads when nothing has reported yet: neither rewarded nor
// punished for a session that has only just started.
export const EFFICIENCY_SCORE_NEUTRAL = 50;

// One source's current opinion of the session.
export const efficiencySignalSchema = z.object({
  /** Stable id of the source: "attention", "quiz", "manual". */
  source: z.string().min(1),
  /** Human-readable, for debug panels and the eventual session summary. */
  label: z.string().min(1),
  /** What this source thinks of the session right now, 0 (bad) to 1 (good). */
  value: z.number().min(0).max(1),
  /** How much it counts against the other sources. Attention is the 1.0 baseline. */
  weight: z.number().positive(),
  /**
   * How fast the reading goes stale, as a half-life in ms: after this long its
   * weight is halved, after twice this long a quarter, and so on. `null` means
   * it never goes stale and counts until it is dropped. A source that reports
   * continuously (attention) barely decays; a one-off (a quiz) fades away.
   */
  halfLifeMs: z.number().positive().nullable(),
  /** When the reading was taken, epoch ms. */
  updatedAt: z.number().nonnegative(),
});

export type EfficiencySignal = z.infer<typeof efficiencySignalSchema>;
