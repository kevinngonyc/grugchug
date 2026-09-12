// The live side of chat: one WebSocket topic per room, plus the roster of who
// is connected to it. A socket is only upgraded after membership is checked
// (see routes/chat.ts), so anything that reaches this module is already
// allowed to be in the room it names.
//
// Presence lives here and nowhere else. It is not stored: the set of open
// sockets *is* the roster, so someone who closes the tab is gone, and a
// restart starts everyone empty. That is what lets the browser draw a train
// per person in the room without any notion of "offline".
import type { ChatPresenceMember, ClientChatEvent, ServerChatEvent } from "@grugchug/shared";
import { clientChatEventSchema } from "@grugchug/shared";
import type { ServerWebSocket, WebSocketHandler } from "bun";
import { CHAT_RATE_LIMIT, RateLimiter } from "./rate-limit";
import { insertMessage, setDisplayName } from "./store";

export interface ChatSocketData {
  roomId: string;
  userId: string;
  displayName: string;
  /** Last study score this connection reported, 0..1. */
  efficiency: number;
  /** Focused time banked today, as last reported by this connection's client. */
  focusedSeconds: number;
  limiter: RateLimiter;
}

type ChatSocket = ServerWebSocket<ChatSocketData>;

export function roomTopic(roomId: string): string {
  return `chat:room:${roomId}`;
}

export function encode(event: ServerChatEvent): string {
  return JSON.stringify(event);
}

export type DecodeResult = { ok: true; event: ClientChatEvent } | { ok: false; detail: string };

/** Parses a frame from a client. Never throws: bad input is a normal case. */
export function decodeClientEvent(raw: string): DecodeResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, detail: "frame is not valid JSON" };
  }
  const parsed = clientChatEventSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, detail: parsed.error.issues[0]?.message ?? "unrecognized event" };
  }
  return { ok: true, event: parsed.data };
}

export function newSocketData(input: {
  roomId: string;
  userId: string;
  displayName: string;
}): ChatSocketData {
  return {
    ...input,
    efficiency: 0,
    focusedSeconds: 0,
    limiter: new RateLimiter(CHAT_RATE_LIMIT),
  };
}

/**
 * The roster a room's members should see. One entry per person, not per
 * socket: two tabs are one rider, and the newest connection's reading wins.
 * Pure, so the ordering and de-duplication are testable without a server.
 */
export function toPresence(connections: readonly ChatSocketData[]): ChatPresenceMember[] {
  const byUser = new Map<string, ChatPresenceMember>();
  for (const data of connections) {
    byUser.set(data.userId, {
      userId: data.userId,
      displayName: data.displayName,
      efficiency: data.efficiency,
      focusedSeconds: data.focusedSeconds,
    });
  }
  return [...byUser.values()];
}

// roomId -> open sockets. Connect order is preserved, which is also the order
// friends' trains take their lanes, so the newest arrival pulls up furthest out.
const connected = new Map<string, Set<ChatSocket>>();

function join(ws: ChatSocket): void {
  const set = connected.get(ws.data.roomId) ?? new Set<ChatSocket>();
  set.add(ws);
  connected.set(ws.data.roomId, set);
}

function leave(ws: ChatSocket): void {
  const set = connected.get(ws.data.roomId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) connected.delete(ws.data.roomId);
}

/**
 * Sends the roster to everyone in the room. Every socket gets it directly
 * rather than through the topic, because `ws.publish` skips the sender and the
 * person who just arrived or renamed themselves needs the new roster too.
 */
function broadcastPresence(roomId: string): void {
  const set = connected.get(roomId);
  if (!set) return;
  const frame = encode({
    type: "presence",
    members: toPresence([...set].map((socket) => socket.data)),
  });
  for (const socket of set) socket.send(frame);
}

function fail(ws: ChatSocket, event: ServerChatEvent): void {
  ws.send(encode(event));
}

async function handleSend(
  ws: ChatSocket,
  event: Extract<ClientChatEvent, { type: "send" }>,
): Promise<void> {
  const message = await insertMessage({
    roomId: ws.data.roomId,
    userId: ws.data.userId,
    displayName: ws.data.displayName,
    body: event.body,
  });

  // Everyone else gets the message plainly; the sender's copy carries their
  // own clientId back so they can replace the optimistic bubble rather than
  // render it twice.
  ws.publish(roomTopic(ws.data.roomId), encode({ type: "message", message, clientId: null }));
  ws.send(encode({ type: "message", message, clientId: event.clientId }));
}

async function handleRename(
  ws: ChatSocket,
  event: Extract<ClientChatEvent, { type: "rename" }>,
): Promise<void> {
  if (ws.data.displayName === event.displayName) return;

  // Every connection this person has, so a second tab does not keep posting
  // under the old name.
  for (const socket of connected.get(ws.data.roomId) ?? []) {
    if (socket.data.userId === ws.data.userId) socket.data.displayName = event.displayName;
  }
  broadcastPresence(ws.data.roomId);
  await setDisplayName(ws.data.userId, event.displayName);
}

// Focus updates are frequent and cheap, and they never touch the database, so
// they skip the message rate limiter. The client throttles them; a flood here
// costs one broadcast to a handful of sockets.
function handleFocus(ws: ChatSocket, event: Extract<ClientChatEvent, { type: "focus" }>): void {
  // An older client sends no total; keep whatever this connection last said.
  const focusedSeconds = event.focusedSeconds ?? ws.data.focusedSeconds;
  if (ws.data.efficiency === event.efficiency && ws.data.focusedSeconds === focusedSeconds) return;
  ws.data.efficiency = event.efficiency;
  ws.data.focusedSeconds = focusedSeconds;
  broadcastPresence(ws.data.roomId);
}

export const chatWebSocket: WebSocketHandler<ChatSocketData> = {
  open(ws) {
    ws.subscribe(roomTopic(ws.data.roomId));
    join(ws);
    ws.send(encode({ type: "ready", roomId: ws.data.roomId }));
    broadcastPresence(ws.data.roomId);
  },

  async message(ws, raw) {
    const decoded = decodeClientEvent(typeof raw === "string" ? raw : raw.toString());
    if (!decoded.ok) {
      fail(ws, { type: "error", code: "invalid_payload", detail: decoded.detail });
      return;
    }

    const event = decoded.event;
    if (event.type === "focus") {
      handleFocus(ws, event);
      return;
    }

    // Anything that writes to the database is rate limited together.
    if (!ws.data.limiter.tryConsume()) {
      fail(ws, { type: "error", code: "rate_limited", detail: "slow down a moment" });
      return;
    }

    try {
      if (event.type === "send") await handleSend(ws, event);
      else await handleRename(ws, event);
    } catch (error) {
      console.error("chat: failed to handle", event.type, error);
      fail(ws, { type: "error", code: "server_error", detail: "that did not go through" });
    }
  },

  close(ws) {
    ws.unsubscribe(roomTopic(ws.data.roomId));
    leave(ws);
    broadcastPresence(ws.data.roomId);
  },
};
