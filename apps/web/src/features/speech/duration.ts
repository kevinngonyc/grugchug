// How long a line stays up when there is no voice clip to time it.
export const SPEECH_BASE_MS = 1500;
export const SPEECH_PER_CHAR_MS = 50;
export const SPEECH_MIN_MS = 2000;
export const SPEECH_MAX_MS = 8000;

export function speechDuration(text: string): number {
  const raw = SPEECH_BASE_MS + SPEECH_PER_CHAR_MS * text.length;
  return Math.min(SPEECH_MAX_MS, Math.max(SPEECH_MIN_MS, raw));
}
