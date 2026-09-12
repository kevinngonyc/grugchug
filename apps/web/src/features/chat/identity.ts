// Who this browser is, as far as chat is concerned. The server mints the
// userId the first time it hands out a room; we keep it here so a reload does
// not turn you into a stranger. Not auth — see CHAT_USER_HEADER.
//
// Nothing gates the app on picking a name: a first visit gets a made-up one so
// the room, the socket and the train can exist immediately, and the field at
// the top of the chat is where it gets changed.
import type { ChatMember } from "@grugchug/shared";
import { readString, removeKey, writeString } from "./storage";

export interface ChatIdentity {
  userId: string;
  displayName: string;
}

const STORAGE_KEY = "grugchug.chat.identity";

/** A name for someone who has not chosen one. Numbered so two strangers in a
 * room are still told apart before either of them renames themselves. */
export function defaultDisplayName(): string {
  return `Rider ${1_000 + Math.floor(Math.random() * 9_000)}`;
}

export function readIdentity(): ChatIdentity | null {
  const raw = readString(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as ChatIdentity).userId === "string" &&
      typeof (parsed as ChatIdentity).displayName === "string"
    ) {
      return parsed as ChatIdentity;
    }
  } catch {
    // Corrupt entry: fall through and behave like a first visit.
  }
  return null;
}

export function writeIdentity(identity: ChatIdentity): ChatIdentity {
  writeString(STORAGE_KEY, JSON.stringify(identity));
  return identity;
}

export function identityFromMember(member: ChatMember): ChatIdentity {
  return { userId: member.userId, displayName: member.displayName };
}

export function clearIdentity(): void {
  removeKey(STORAGE_KEY);
}
