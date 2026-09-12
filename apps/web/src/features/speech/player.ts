import type { Speech } from "@grugchug/shared";
import { useWorld } from "@/features/world";
import { speechDuration } from "./duration";

// The slice of HTMLAudioElement the player needs, so tests can fake it.
export type AudioLike = {
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: "ended" | "error", listener: () => void): void;
};

export type SpeechPlayerDeps = {
  createAudio: (url: string) => AudioLike;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export type SpeechPlayer = { start(): void; stop(): void };

type Playing = { speechId: string; audio: AudioLike | null; timer: unknown | null };

// Watches the world for new utterances on every train, plays each once, and
// clears it from the store when it finishes. A driver, like the session
// timer: it reaches the world only through commands.
export function createSpeechPlayer(deps: SpeechPlayerDeps): SpeechPlayer {
  const seen = new Set<string>();
  const playing = new Map<string, Playing>();
  let unsubscribe: (() => void) | null = null;

  const halt = (entry: Playing) => {
    entry.audio?.pause();
    if (entry.timer !== null) deps.clearTimeout(entry.timer);
  };

  const stopTrain = (trainId: string) => {
    const entry = playing.get(trainId);
    if (!entry) return;
    halt(entry);
    playing.delete(trainId);
  };

  // Only the line that is still current may clear itself.
  const finish = (trainId: string, speechId: string) => {
    const entry = playing.get(trainId);
    if (entry?.speechId !== speechId) return;
    halt(entry);
    playing.delete(trainId);
    useWorld.getState().clearSpeech(trainId, speechId);
  };

  const startTimer = (trainId: string, speech: Speech): unknown =>
    deps.setTimeout(() => finish(trainId, speech.id), speechDuration(speech.text));

  const play = (trainId: string, speech: Speech) => {
    seen.add(speech.id);
    stopTrain(trainId);
    const entry: Playing = { speechId: speech.id, audio: null, timer: null };
    playing.set(trainId, entry);

    if (speech.audioUrl === undefined) {
      entry.timer = startTimer(trainId, speech);
      return;
    }

    const audio = deps.createAudio(speech.audioUrl);
    entry.audio = audio;
    audio.addEventListener("ended", () => finish(trainId, speech.id));

    // A clip that will not play (autoplay blocked, bad URL) should not leave the
    // bubble up forever or drop it instantly: time it like a text-only line.
    const fallBack = () => {
      if (playing.get(trainId) !== entry || entry.timer !== null) return;
      entry.timer = startTimer(trainId, speech);
    };
    audio.addEventListener("error", fallBack);
    audio.play().catch(fallBack);
  };

  const sync = () => {
    const { trains } = useWorld.getState();
    for (const [trainId, train] of Object.entries(trains)) {
      const speech = train.speech;
      if (speech && !seen.has(speech.id)) play(trainId, speech);
    }
    // Trains that vanished take their clips with them.
    for (const trainId of [...playing.keys()]) {
      if (!trains[trainId]) stopTrain(trainId);
    }
  };

  return {
    start() {
      if (unsubscribe) return;
      unsubscribe = useWorld.subscribe(sync);
      sync();
    },
    // Clears what it stops so a remounted player never replays a stale line.
    stop() {
      unsubscribe?.();
      unsubscribe = null;
      for (const [trainId, entry] of [...playing]) {
        halt(entry);
        playing.delete(trainId);
        useWorld.getState().clearSpeech(trainId, entry.speechId);
      }
    },
  };
}
