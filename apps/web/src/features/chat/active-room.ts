// Which room the session overlay is showing. Remembered so a reload, or an
// invite link, drops you back into the conversation instead of the picker.
import { readString, removeKey, writeString } from "./storage";

const STORAGE_KEY = "grugchug.chat.activeRoom";

export function readActiveRoomId(): string | null {
  const value = readString(STORAGE_KEY);
  return value && value.trim() !== "" ? value : null;
}

export function writeActiveRoomId(roomId: string): void {
  writeString(STORAGE_KEY, roomId);
}

export function clearActiveRoomId(): void {
  removeKey(STORAGE_KEY);
}
