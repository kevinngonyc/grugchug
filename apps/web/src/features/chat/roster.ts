// Who is in the room right now, as the server last told us. Live only: it is
// empty until a socket is open and it empties again when one drops, because
// the roster *is* the set of open sockets on the server.
//
// A store rather than hook state because it has two readers with nothing in
// common — the panel, which lists names, and features/session, which turns the
// roster into trains in the world.
import type { ChatPresenceMember } from "@grugchug/shared";
import { create } from "zustand";

interface RosterState {
  members: ChatPresenceMember[];
  /**
   * Which roster entry is us: our own socket's id, as the server named it on
   * `ready`. Not read from stored identity — a second tab writing its own
   * identity to the same localStorage key would make this tab mistake a
   * friend for itself, draw a train for itself, and wear the other tab's name.
   */
  selfId: string | null;
  setMembers: (members: ChatPresenceMember[]) => void;
  setSelfId: (selfId: string | null) => void;
  clear: () => void;
}

export const useRosterStore = create<RosterState>()((set) => ({
  members: [],
  selfId: null,
  setMembers: (members) => set({ members }),
  setSelfId: (selfId) => set({ selfId }),
  clear: () => set({ members: [], selfId: null }),
}));

/** Everyone connected, in the order they arrived. Includes you. */
export function useRoster(): ChatPresenceMember[] {
  return useRosterStore((s) => s.members);
}

/** Our own connection id, or null while there is no socket. */
export function useRosterSelfId(): string | null {
  return useRosterStore((s) => s.selfId);
}
