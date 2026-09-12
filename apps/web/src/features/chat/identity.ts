// Who this browser is, as far as chat is concerned. The server mints the
// userId the first time you create or join a room; we keep it here so a
// reload does not turn you into a stranger. Not auth — see CHAT_USER_HEADER.
import type { ChatMember } from "@grugchug/shared";

export interface ChatIdentity {
  userId: string;
  displayName: string;
}

const STORAGE_KEY = "grugchug.chat.identity";

// localStorage throws in private windows and is absent in tests, so every
// access is guarded and a failure just means "no stored identity".
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readIdentity(): ChatIdentity | null {
  const raw = storage()?.getItem(STORAGE_KEY);
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
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Out of quota or blocked: chat still works for this page view.
  }
  return identity;
}

export function identityFromMember(member: ChatMember): ChatIdentity {
  return { userId: member.userId, displayName: member.displayName };
}

export function clearIdentity(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}
