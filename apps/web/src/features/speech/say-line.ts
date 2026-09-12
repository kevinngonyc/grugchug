import { useWorld } from "@/features/world";
import { VOICE_LINES, type VoiceLineId } from "./lines";

// Has the local conductor say a registered line, clip and all. For events the
// world does not know about, such as a passed quiz; phase changes are voiced
// by the departure announcer without any call here.
export function sayLine(id: VoiceLineId): void {
  const { localTrainId, say } = useWorld.getState();
  if (localTrainId === null) return;
  const line = VOICE_LINES[id];
  say(localTrainId, line.text, line.audioUrl);
}
