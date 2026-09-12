import { useEffect } from "react";
import { createSpeechPlayer, type SpeechPlayerDeps } from "./player";

// Mount once on the page that shows the world. Clips play only for the local
// train; other trains' lines are bubbles timed by their text. Clears each
// line when it is over.
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
