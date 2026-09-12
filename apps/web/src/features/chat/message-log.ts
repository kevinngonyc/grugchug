// The message list as pure state. Kept free of React and of the socket so the
// ordering and de-duplication rules can be tested on their own.
import type { ChatMessage } from "@grugchug/shared";

/** A message typed here but not yet acknowledged by the server. */
export interface PendingMessage {
  clientId: string;
  body: string;
  createdAt: string;
  failed: boolean;
}

export interface ChatLog {
  messages: ChatMessage[];
  pending: PendingMessage[];
}

export const emptyChatLog: ChatLog = { messages: [], pending: [] };

export type ChatLogAction =
  | { type: "history"; messages: ChatMessage[] }
  | { type: "received"; message: ChatMessage; clientId: string | null }
  | { type: "queued"; pending: PendingMessage }
  | { type: "failed"; clientId: string }
  | { type: "reset" };

// Server time is the ordering authority; id breaks ties so two messages
// written in the same millisecond still have one stable order everywhere.
function compare(a: ChatMessage, b: ChatMessage): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Folds messages in, last writer wins per id. Reconnects replay history that
 * overlaps what is already on screen, so merging has to be idempotent.
 */
export function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) return existing;
  const byId = new Map(existing.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(compare);
}

export function chatLogReducer(state: ChatLog, action: ChatLogAction): ChatLog {
  switch (action.type) {
    case "history":
      return { ...state, messages: mergeMessages(state.messages, action.messages) };

    case "received": {
      const messages = mergeMessages(state.messages, [action.message]);
      // Our own message came back stored: drop the optimistic copy so it is
      // not rendered twice.
      const pending = action.clientId
        ? state.pending.filter((item) => item.clientId !== action.clientId)
        : state.pending;
      return { messages, pending };
    }

    case "queued":
      return { ...state, pending: [...state.pending, action.pending] };

    case "failed":
      return {
        ...state,
        pending: state.pending.map((item) =>
          item.clientId === action.clientId ? { ...item, failed: true } : item,
        ),
      };

    case "reset":
      return emptyChatLog;
  }
}
