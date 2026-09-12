// Conductor speech. The player watches the world for new utterances, plays the
// voice clip (or waits a text-length fallback), and clears the speech when it
// is over; it is the only thing that ever clears speech. The departure
// announcer says the start-of-session line when the local train departs, and
// lines.ts is the registry of clips a conductor can say. The scene supplies
// positional audio and renders speech; this driver owns playback lifetime.

export { VOICE_LINES, type VoiceLine, type VoiceLineId } from "./lines";
export { useDepartureAnnouncer } from "./use-departure-announcer";
export { useSpeechPlayer } from "./use-speech-player";
