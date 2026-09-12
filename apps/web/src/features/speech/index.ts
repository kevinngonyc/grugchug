// Conductor speech. The player watches the world for new utterances, plays the
// voice clip (or waits a text-length fallback), and clears the speech when it
// is over; it is the only thing that ever clears speech. Narration is the
// study session's job now: `sayLine` voices events the world does not see (a
// passed quiz, a phase change), `sayText` voices a plain line with no
// recording (naming the next station), and lines.ts is the registry of clips
// a conductor can say. The scene supplies positional audio and renders
// speech; this driver owns playback lifetime.

export { VOICE_LINES, type VoiceLine, type VoiceLineId } from "./lines";
export { sayLine, sayText } from "./say-line";
export { useSpeechPlayer } from "./use-speech-player";
