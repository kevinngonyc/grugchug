// Chat as it appears during a study session: a bubble in the corner of the
// scene that opens a panel over it.
//
// The panel is hidden rather than unmounted. That used to be about not
// dropping the socket on every toggle; now it is load-bearing, because the
// socket is how the room knows you are here and how your friends' trains stay
// on the track.
import { MessageCircle, X } from "lucide-react";
import { useState } from "react";
import { ChatPanel } from "./chat-panel";

export function ChatOverlay() {
  const [open, setOpen] = useState(false);

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
        <ChatPanel />
      </div>
    </>
  );
}
