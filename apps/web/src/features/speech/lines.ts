// Voice lines the conductor can say. The clips in public/audio are the source
// of truth; the captions are PLACEHOLDERS until the real transcripts are
// pasted in. Adding a line: drop the clip in public/audio and register it here.
export type VoiceLine = { text: string; audioUrl: string };

export const VOICE_LINES = {
  startSession: {
    text: "All aboard! Let's get this study session rolling.", // PLACEHOLDER caption
    audioUrl: "/audio/start_session1.mp3",
  },
  greatSession: {
    text: "Great session! You kept this train right on time.", // PLACEHOLDER caption
    audioUrl: "/audio/great_session1.mp3",
  },
  passQuiz: {
    text: "Quiz passed. Full steam ahead!", // PLACEHOLDER caption
    audioUrl: "/audio/pass_quiz1.mp3",
  },
} as const satisfies Record<string, VoiceLine>;

export type VoiceLineId = keyof typeof VOICE_LINES;
