// The live side of chat: one WebSocket topic per room. A socket is only
// upgraded after membership is checked (see routes/chat.ts), so anything that
// reaches this module is already allowed to be in the room it names.
import type { ClientChatEvent, ServerChatEvent } from "@grugchug/shared";
import { clientChatEventSchema } from "@grugchug/shared";
import type { ServerWebSocket, WebSocketHandler } from "bun";
import { CHAT_RATE_LIMIT, RateLimiter } from "./rate-limit";
import { insertMessage } from "./store";

export interface ChatSocketData {
  roomId: string;
  userId: string;
  displayName: string;
  limiter: RateLimiter;
}

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
  return { ...input, limiter: new RateLimiter(CHAT_RATE_LIMIT) };
}

function fail(ws: ServerWebSocket<ChatSocketData>, event: ServerChatEvent): void {
  ws.send(encode(event));
}

async function handleSend(
  ws: ServerWebSocket<ChatSocketData>,
  event: Extract<ClientChatEvent, { type: "send" }>,
): Promise<void> {
  if (!ws.data.limiter.tryConsume()) {
    fail(ws, { type: "error", code: "rate_limited", detail: "slow down a moment" });
    return;
  }

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

export const chatWebSocket: WebSocketHandler<ChatSocketData> = {
  open(ws) {
    ws.subscribe(roomTopic(ws.data.roomId));
    ws.send(encode({ type: "ready", roomId: ws.data.roomId }));
  },

  async message(ws, raw) {
    const decoded = decodeClientEvent(typeof raw === "string" ? raw : raw.toString());
    if (!decoded.ok) {
      fail(ws, { type: "error", code: "invalid_payload", detail: decoded.detail });
      return;
    }

    try {
      await handleSend(ws, decoded.event);
    } catch (error) {
      console.error("chat: failed to handle", decoded.event.type, error);
      fail(ws, { type: "error", code: "server_error", detail: "message was not saved" });
    }
  },

  close(ws) {
    ws.unsubscribe(roomTopic(ws.data.roomId));
  },
};
