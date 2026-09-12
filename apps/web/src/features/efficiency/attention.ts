// Attention: the share of recent time spent facing the screen, as a 0..1
// value, weighted so the last minute counts for much more than the last hour.
// Pure — the caller supplies the previous value and how long ago it was taken.

/** After this long, a stretch of looking away has cost half its influence. */
export const ATTENTION_HALF_LIFE_MS = 60_000;

/** Where attention starts before anything has been observed. */
export const NEUTRAL_ATTENTION = 0.5;

/**
 * Folds one observation into the running average. `previous` is the value
 * before this observation, `null` on the first one — a session opens at
 * neutral and eases toward whatever it sees, rather than snapping straight to
 * an extreme on the very first reading (looking at the screen once should not
 * put the score at 100 before the tracker has said anything about a second
 * turn, and looking away once should not tank it either).
 */
export function foldAttention(
  previous: number | null,
  facing: boolean,
  elapsedMs: number,
  halfLifeMs: number = ATTENTION_HALF_LIFE_MS,
): number {
  const observation = facing ? 1 : 0;
  const start = previous ?? NEUTRAL_ATTENTION;
  if (!(elapsedMs > 0) || !(halfLifeMs > 0)) return start;

  const decay = 2 ** (-elapsedMs / halfLifeMs);
  return start * decay + observation * (1 - decay);
}
