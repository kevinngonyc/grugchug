// Presentational only: given a log, draw it. No socket, no fetching, so it
// renders in a test without a server.
//
// Runs of messages from one person collapse into a single stack of bubbles
// under one name, with the time under the last of them — the iMessage shape.
import type { ChatLog } from "./message-log";

export interface MessageListProps {
  log: ChatLog;
  currentUserId: string;
}

export type BubbleState = "sent" | "sending" | "failed";

export interface Bubble {
  key: string;
  body: string;
  createdAt: string;
  state: BubbleState;
}

export interface Entry extends Bubble {
  senderId: string;
  displayName: string;
  mine: boolean;
}

export interface Group {
  key: string;
  senderId: string;
  displayName: string;
  mine: boolean;
  bubbles: Bubble[];
}

/** A pause this long starts a new stack, even from the same person. */
const GROUP_GAP_MS = 5 * 60 * 1_000;

function timeOf(iso: string): number {
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? Number.NaN : ms;
}

function timeLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function toEntries(log: ChatLog, currentUserId: string): Entry[] {
  const stored: Entry[] = log.messages.map((message) => ({
    key: message.id,
    body: message.body,
    createdAt: message.createdAt,
    state: "sent",
    senderId: message.userId,
    displayName: message.displayName,
    mine: message.userId === currentUserId,
  }));

  // Everything unacknowledged is ours, and it is always the newest thing said.
  const inFlight: Entry[] = log.pending.map((pending) => ({
    key: pending.clientId,
    body: pending.body,
    createdAt: pending.createdAt,
    state: pending.failed ? "failed" : "sending",
    senderId: currentUserId,
    displayName: "You",
    mine: true,
  }));

  return [...stored, ...inFlight];
}

export function groupEntries(entries: Entry[]): Group[] {
  const groups: Group[] = [];

  for (const entry of entries) {
    const open = groups.at(-1);
    const previous = open?.bubbles.at(-1);
    const gap = previous ? timeOf(entry.createdAt) - timeOf(previous.createdAt) : Number.NaN;
    const continues =
      open?.senderId === entry.senderId && Number.isFinite(gap) && Math.abs(gap) < GROUP_GAP_MS;

    if (open && continues) {
      open.bubbles.push(entry);
      continue;
    }
    groups.push({
      key: entry.key,
      senderId: entry.senderId,
      displayName: entry.displayName,
      mine: entry.mine,
      bubbles: [entry],
    });
  }

  return groups;
}

function bubbleClass(mine: boolean, last: boolean, state: BubbleState): string {
  const base =
    "max-w-[85%] rounded-[1.25rem] px-3.5 py-2 text-sm leading-snug whitespace-pre-wrap break-words";
  const tone = mine
    ? "bg-chat-mine text-chat-mine-foreground"
    : "bg-chat-theirs text-chat-theirs-foreground";
  // The squared-off corner on the last bubble is what reads as the tail.
  const tail = last ? (mine ? "rounded-br-[0.35rem]" : "rounded-bl-[0.35rem]") : "";
  return `${base} ${tone} ${tail} ${state === "sent" ? "" : "opacity-60"}`;
}

function footerLabel(group: Group): string {
  const last = group.bubbles.at(-1);
  if (!last) return "";
  if (last.state === "sending") return "Sending…";
  if (last.state === "failed") return "Not sent";
  return timeLabel(last.createdAt);
}

export function MessageList({ log, currentUserId }: MessageListProps) {
  if (log.messages.length === 0 && log.pending.length === 0) {
    return (
      <p className="m-auto max-w-[16rem] text-center text-sm text-muted-foreground">
        Nothing here yet. Say something, or send someone the invite link.
      </p>
    );
  }

  const groups = groupEntries(toEntries(log, currentUserId));

  return (
    <ul className="mt-auto flex flex-col gap-3 py-1">
      {groups.map((group) => {
        const failed = group.bubbles.at(-1)?.state === "failed";
        return (
          <li
            key={group.key}
            className={`flex flex-col gap-0.5 ${group.mine ? "items-end" : "items-start"}`}
          >
            {group.mine ? null : (
              <span className="px-3 text-xs text-muted-foreground">{group.displayName}</span>
            )}
            {group.bubbles.map((bubble, index) => (
              <div
                key={bubble.key}
                className={bubbleClass(
                  group.mine,
                  index === group.bubbles.length - 1,
                  bubble.state,
                )}
              >
                {bubble.body}
              </div>
            ))}
            <span
              className={`px-3 text-[0.6875rem] ${failed ? "text-destructive" : "text-muted-foreground"}`}
            >
              {footerLabel(group)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
