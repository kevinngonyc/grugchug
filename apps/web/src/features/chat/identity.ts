// Who this browser is, as far as chat is concerned. The server mints the
// userId the first time you create or join a room; we keep it here so a
// reload does not turn you into a stranger. Not auth — see CHAT_USER_HEADER.
import type { ChatMember } from "@grugchug/shared";
import { readString, removeKey, writeString } from "./storage";

export interface ChatIdentity {
  userId: string;
  displayName: string;
}

const STORAGE_KEY = "grugchug.chat.identity";

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
