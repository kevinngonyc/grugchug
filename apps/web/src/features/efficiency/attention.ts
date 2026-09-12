// Attention: the share of recent time spent facing the screen, as a 0..1
// value, weighted so the last minute counts for much more than the last hour.
// Pure — the caller supplies the previous value and how long ago it was taken.

/** After this long, a stretch of looking away has cost half its influence. */
export const ATTENTION_HALF_LIFE_MS = 60_000;

/**
 * Folds one observation into the running average. `previous` is the value
 * before this observation, `null` on the first one — a session opens at
 * whatever it sees rather than climbing out of zero.
 */
export function foldAttention(
  previous: number | null,
  facing: boolean,
  elapsedMs: number,
  halfLifeMs: number = ATTENTION_HALF_LIFE_MS,
): number {
  const observation = facing ? 1 : 0;
  if (previous === null) return observation;
  if (!(elapsedMs > 0) || !(halfLifeMs > 0)) return previous;

  const decay = 2 ** (-elapsedMs / halfLifeMs);
  return previous * decay + observation * (1 - decay);
}
