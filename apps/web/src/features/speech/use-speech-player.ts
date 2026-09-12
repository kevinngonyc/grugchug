import { useEffect } from "react";
import { createSpeechPlayer, type SpeechPlayerDeps } from "./player";

// Mount once on the page that shows the world. Plays every train's speech,
// friends included, and clears each line when its clip ends.
type VoiceOutput = { createAudio: SpeechPlayerDeps["createAudio"]; dispose(): void };

export function useSpeechPlayer(createOutput: () => VoiceOutput): void {
  useEffect(() => {
    const output = createOutput();
    const player = createSpeechPlayer({
      createAudio: output.createAudio,
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (handle) => window.clearTimeout(handle as number),
    });
    player.start();
    return () => {
      player.stop();
      output.dispose();
    };
  }, [createOutput]);
}
