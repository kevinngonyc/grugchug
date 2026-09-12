// Conductor speech. The player watches the world for new utterances, plays the
// voice clip (or waits a text-length fallback), and clears the speech when it
// is over; it is the only thing that ever clears speech. The departure
// announcer voices the local train's phase changes (start, break, restart,
// finish), `sayLine` voices events the world does not see (a passed quiz),
// `sayText` voices a plain line with no recording (naming the next station),
// and lines.ts is the registry of clips a conductor can say. The scene
// supplies positional audio and renders speech; this driver owns playback
// lifetime.

export { VOICE_LINES, type VoiceLine, type VoiceLineId } from "./lines";
export { sayLine, sayText } from "./say-line";
export { useDepartureAnnouncer } from "./use-departure-announcer";
export { useSpeechPlayer } from "./use-speech-player";
