import { useWorld } from "@/features/world";
import { VOICE_LINES, type VoiceLineId } from "./lines";

// Has the local conductor say a registered line, clip and all. For events the
// world does not know about, such as a passed quiz or a phase change the
// study session narrates directly.
export function sayLine(id: VoiceLineId): void {
  const { localTrainId, say } = useWorld.getState();
  if (localTrainId === null) return;
  const line = VOICE_LINES[id];
  say(localTrainId, line.text, line.audioUrl);
}

// A line with no recording: a bubble timed by its length. For moments the
// conductor should mark but nobody recorded, such as naming the next station.
export function sayText(text: string): void {
  const { localTrainId, say } = useWorld.getState();
  if (localTrainId === null) return;
  say(localTrainId, text);
}
