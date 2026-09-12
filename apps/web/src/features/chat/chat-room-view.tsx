// One room, live: history from the API, new messages over the socket. Sized
// for the session overlay, so it fills whatever box it is given.
import type { ChatRoom } from "@grugchug/shared";
import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getRoom } from "./api";
import { ChatComposer } from "./chat-composer";
import { readIdentity } from "./identity";
import { InvitePanel } from "./invite-panel";
import { MessageList } from "./message-list";
import { secondaryButtonClass } from "./ui";
import { useChatRoom } from "./use-chat-room";

export interface ChatRoomViewProps {
  roomId: string;
  /** Leave this room and go back to the picker. */
  onBack: () => void;
}

const statusLabel = {
  connecting: "Connecting…",
  open: "Live",
  offline: "Reconnecting…",
} as const;

export function ChatRoomView({ roomId, onBack }: ChatRoomViewProps) {
  // Read once: a changing identity object would tear down the socket.
  const [identity] = useState(readIdentity);
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { log, status, error, send } = useChatRoom(roomId, identity?.userId ?? null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    getRoom(roomId, identity.userId)
      .then((response) => {
        if (!cancelled) setRoom(response.room);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setLoadError(cause instanceof Error ? cause.message : "could not open this room");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, identity]);

  // Follow the conversation as it grows, but do not yank an empty room.
  useEffect(() => {
    if (log.messages.length === 0 && log.pending.length === 0) return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [log]);

  if (!identity || loadError) {
    return (
      <div className="flex flex-col items-start gap-3 p-4">
        <p className="text-sm text-destructive">{loadError ?? "You are not in this room yet."}</p>
        <button type="button" className={secondaryButtonClass} onClick={onBack}>
          Back to your rooms
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to your rooms"
          className="rounded-md px-1.5 py-1 text-muted-foreground hover:bg-accent"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex min-w-0 flex-col">
          <h2 className="truncate text-sm font-semibold">{room?.name ?? "Room"}</h2>
          <span className="text-[0.6875rem] text-muted-foreground">{statusLabel[status]}</span>
        </div>
        {room && (
          <div className="ml-auto">
            <InvitePanel inviteCode={room.inviteCode} />
          </div>
        )}
      </header>

      {error && <p className="px-3 pt-2 text-xs text-destructive">{error}</p>}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3">
        <MessageList log={log} currentUserId={identity.userId} />
        <div ref={endRef} />
      </div>

      <div className="px-3 pb-3">
        <ChatComposer onSend={send} />
      </div>
    </div>
  );
}
