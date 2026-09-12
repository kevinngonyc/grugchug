import type { ChatRoom } from "@grugchug/shared";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { getRoom } from "./api";
import { ChatComposer } from "./chat-composer";
import { readIdentity } from "./identity";
import { InvitePanel } from "./invite-panel";
import { MessageList } from "./message-list";
import { useChatRoom } from "./use-chat-room";

export interface ChatRoomViewProps {
  roomId: string;
}

const statusLabel = {
  connecting: "Connecting…",
  open: "Live",
  offline: "Reconnecting…",
} as const;

export function ChatRoomView({ roomId }: ChatRoomViewProps) {
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

  if (!identity) {
    return (
      <p className="text-sm text-muted-foreground">
        You are not in this room yet.{" "}
        <Link to="/chat" className="underline">
          Join with an invite code
        </Link>
        .
      </p>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-destructive">{loadError}</p>
        <Link to="/chat" className="text-sm underline">
          Back to your rooms
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold">{room?.name ?? "Room"}</h1>
          <span className="text-xs text-muted-foreground">{statusLabel[status]}</span>
        </div>
        {room && <InvitePanel inviteCode={room.inviteCode} />}
      </header>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex min-h-0 flex-1 flex-col rounded-lg border p-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <MessageList log={log} currentUserId={identity.userId} />
          <div ref={endRef} />
        </div>
        <ChatComposer onSend={send} />
      </div>
    </div>
  );
}
