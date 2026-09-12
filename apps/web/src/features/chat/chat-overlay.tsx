// Chat as it appears during a study session: a bubble in the corner of the
// scene that opens a panel over it. This owns which room is on screen; the
// views below it know nothing about the overlay or about routing.
//
// The panel is hidden rather than unmounted, so closing it does not drop the
// socket and reopening does not replay history.
import { MessageCircle, X } from "lucide-react";
import { useState } from "react";
import { clearActiveRoomId, readActiveRoomId, writeActiveRoomId } from "./active-room";
import { ChatRoomView } from "./chat-room-view";
import { ChatRoomsView } from "./chat-rooms-view";

export function ChatOverlay() {
  const [open, setOpen] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(readActiveRoomId);

  function openRoom(id: string): void {
    writeActiveRoomId(id);
    setRoomId(id);
    setOpen(true);
  }

  function leaveRoom(): void {
    clearActiveRoomId();
    setRoomId(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? "Hide chat" : "Show chat"}
        className={
          "absolute right-4 bottom-4 z-20 flex size-12 items-center justify-center rounded-full " +
          "bg-chat-mine text-chat-mine-foreground shadow-lg transition hover:opacity-90 " +
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        }
      >
        {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
      </button>

      <div
        aria-hidden={!open}
        className={
          `absolute right-4 bottom-20 z-10 ${open ? "flex" : "hidden"} ` +
          "w-[min(22rem,calc(100%-2rem))] flex-col " +
          "max-h-[min(32rem,calc(100%-7rem))] overflow-hidden rounded-2xl " +
          // Glass: the scene stays visible through the panel, and the blur is
          // what keeps text off a moving background legible. Bubbles stay solid.
          "border border-border/40 bg-background/55 shadow-xl backdrop-blur-md"
        }
      >
        {roomId === null ? (
          <ChatRoomsView onOpenRoom={openRoom} />
        ) : (
          <ChatRoomView roomId={roomId} onBack={leaveRoom} />
        )}
      </div>
    </>
  );
}
