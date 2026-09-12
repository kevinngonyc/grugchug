import { useEffect } from "react";
import { createSpeechPlayer } from "./player";

// Mount once on the page that shows the world. Plays every train's speech,
// friends included, and clears each line when its clip ends.
export function useSpeechPlayer(): void {
  useEffect(() => {
    const player = createSpeechPlayer({
      createAudio: (url) => new Audio(url),
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (handle) => window.clearTimeout(handle as number),
    });
    player.start();
    return () => player.stop();
  }, []);
}
