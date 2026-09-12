// Plays conductor speech. Watches the world for new utterances, plays the
// voice clip (or waits a text-length fallback), and clears the speech when it
// is over. The only thing that ever clears speech; the scene just shows it.
export { useSpeechPlayer } from "./use-speech-player";
