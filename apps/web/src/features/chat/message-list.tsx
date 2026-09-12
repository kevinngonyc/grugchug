// Presentational only: given a log, draw it. No socket, no fetching, so it
// renders in a test without a server.
import type { ChatLog } from "./message-log";

export interface MessageListProps {
  log: ChatLog;
  currentUserId: string;
}

function timeLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function bubbleClass(mine: boolean, muted: boolean): string {
  const base = "max-w-[75%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words";
  const tone = mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground";
  return `${base} ${tone} ${muted ? "opacity-60" : ""}`;
}

export function MessageList({ log, currentUserId }: MessageListProps) {
  if (log.messages.length === 0 && log.pending.length === 0) {
    return (
      <p className="m-auto text-sm text-muted-foreground">
        Nothing here yet. Say something, or send someone the invite link.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {log.messages.map((message) => {
        const mine = message.userId === currentUserId;
        return (
          <li
            key={message.id}
            className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}
          >
            <span className="px-1 text-xs text-muted-foreground">
              {mine ? "You" : message.displayName} · {timeLabel(message.createdAt)}
            </span>
            <div className={bubbleClass(mine, false)}>{message.body}</div>
          </li>
        );
      })}

      {log.pending.map((pending) => (
        <li key={pending.clientId} className="flex flex-col items-end gap-1">
          <span className="px-1 text-xs text-muted-foreground">
            {pending.failed ? "Not sent" : "Sending…"}
          </span>
          <div className={bubbleClass(true, true)}>{pending.body}</div>
        </li>
      ))}
    </ul>
  );
}
