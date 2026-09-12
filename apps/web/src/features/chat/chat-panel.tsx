// The whole chat, as one panel. There is one room and you are always in it, so
// there is nothing to pick and nothing to navigate: the header — your name and
// the invite link — is permanent, and the log fills the rest.
//
// This is also where the room's socket lives, and the socket is what carries
// presence, so it stays mounted for the whole session. Closing the panel hides
// it; it does not disconnect anyone.
import type { ChatPresenceMember } from "@grugchug/shared";
import { useCallback } from "react";
import { ChatComposer } from "./chat-composer";
import { InvitePanel } from "./invite-panel";
import { MessageList } from "./message-list";
import { NameField } from "./name-field";
import { useRoster, useRosterSelfId } from "./roster";
import { useChatRoom } from "./use-chat-room";
import { useMyRoom } from "./use-my-room";

const statusLabel = {
  connecting: "Connecting…",
  open: "Live",
  offline: "Reconnecting…",
} as const;

/**
 * Who else is riding, as a sentence. Pure so the joining rules are testable;
 * the roster from the server includes you, and you are not news to yourself.
 */
export function ridersLabel(members: readonly ChatPresenceMember[], selfId: string | null): string {
  const others = members
    .filter((member) => member.connectionId !== selfId)
    .map((m) => m.displayName);
  if (others.length === 0) return "Riding alone — send someone the invite link.";
  if (others.length === 1) return `${others[0]} is riding with you.`;
  if (others.length === 2) return `${others[0]} and ${others[1]} are riding with you.`;
  return `${others.slice(0, -1).join(", ")} and ${others.at(-1)} are riding with you.`;
}

export function ChatPanel() {
  const { room, identity, error: roomError, setLocalName } = useMyRoom();
  const { log, status, error, send, rename } = useChatRoom(
    room?.id ?? null,
    identity?.userId ?? null,
  );
  const roster = useRoster();
  // Which entry is us on the wire; the stored userId cannot say, since every
  // tab of this browser shares it.
  const selfId = useRosterSelfId();

  const onRename = useCallback(
    (displayName: string) => {
      setLocalName(displayName);
      rename(displayName);
    },
    [setLocalName, rename],
  );

  const problem = roomError ?? error;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-col gap-1.5 border-b border-border/40 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <NameField value={identity?.displayName ?? ""} disabled={!identity} onCommit={onRename} />
          <InvitePanel inviteCode={room?.inviteCode ?? null} />
        </div>
        <p className="truncate text-[0.6875rem] text-muted-foreground">
          {room ? ridersLabel(roster, selfId) : statusLabel[status]}
        </p>
      </header>

      {problem && <p className="px-3 pt-2 text-xs text-destructive">{problem}</p>}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3">
        <MessageList log={log} currentUserId={identity?.userId ?? ""} />
      </div>

      <div className="px-3 pb-3">
        <ChatComposer onSend={send} disabled={!room} />
      </div>
    </div>
  );
}
