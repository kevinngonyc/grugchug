import { useEffect } from "react";
import { createDepartureAnnouncer } from "./departure";

// Mount once on the page that shows the world, alongside useSpeechPlayer.
export function useDepartureAnnouncer(): void {
  useEffect(() => {
    const announcer = createDepartureAnnouncer();
    announcer.start();
    return () => announcer.stop();
  }, []);
}
