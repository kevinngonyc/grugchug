// Owns the room's live socket: connect, reconnect, and turn frames into
// message-log actions. All ordering and de-duplication lives in message-log.
import type { ClientChatEvent } from "@grugchug/shared";
import { serverChatEventSchema } from "@grugchug/shared";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { chatSocketUrl, listMessages } from "./api";
import { type ChatLog, chatLogReducer, emptyChatLog } from "./message-log";

export type ChatConnectionStatus = "connecting" | "open" | "offline";

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;

export interface ChatRoomConnection {
  log: ChatLog;
  status: ChatConnectionStatus;
  error: string | null;
  send: (body: string) => void;
}

export function useChatRoom(roomId: string, userId: string | null): ChatRoomConnection {
  const [log, dispatch] = useReducer(chatLogReducer, emptyChatLog);
  const [status, setStatus] = useState<ChatConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!userId) return;

    dispatch({ type: "reset" });
    let disposed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | undefined;

    // Pulled on every (re)connect, not just on mount: a socket that dropped
    // may have missed messages, and merging history is idempotent.
    async function loadHistory(): Promise<void> {
      if (!userId) return;
      try {
        const messages = await listMessages(roomId, userId);
        if (!disposed) dispatch({ type: "history", messages });
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : "could not load history");
      }
    }

    function handleFrame(raw: string): void {
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        return;
      }
      const parsed = serverChatEventSchema.safeParse(json);
      if (!parsed.success) return;

      switch (parsed.data.type) {
        case "ready":
          break;
        case "message":
          dispatch({
            type: "received",
            message: parsed.data.message,
            clientId: parsed.data.clientId,
          });
          break;
        case "error":
          setError(parsed.data.detail ?? parsed.data.code);
          break;
      }
    }

    // React runs effects twice in development, so the first socket is torn
    // down while its handshake is still in flight. Calling close() on a
    // CONNECTING socket is what makes the browser log "WebSocket is closed
    // before the connection is established", so wait for the handshake and
    // close then. Handlers come off first either way, so a socket we have
    // let go of can never dispatch into an unmounted component.
    function dispose(target: WebSocket): void {
      target.onopen = null;
      target.onmessage = null;
      target.onclose = null;
      if (target.readyState === WebSocket.CONNECTING) {
        target.addEventListener("open", () => target.close(), { once: true });
        return;
      }
      target.close();
    }

    function connect(): void {
      if (disposed || !userId) return;
      setStatus("connecting");
      socket = new WebSocket(chatSocketUrl(roomId, userId));
      socketRef.current = socket;

      socket.onopen = () => {
        attempt = 0;
        setStatus("open");
        setError(null);
        void loadHistory();
      };
      socket.onmessage = (event: MessageEvent<string>) => handleFrame(event.data);
      socket.onclose = () => {
        socketRef.current = null;
        if (disposed) return;
        setStatus("offline");
        // Exponential backoff so a server restart is not a retry storm.
        const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt);
        attempt += 1;
        retryTimer = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      socketRef.current = null;
      if (socket) dispose(socket);
    };
  }, [roomId, userId]);

  const send = useCallback((body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return;

    const clientId = crypto.randomUUID();
    dispatch({
      type: "queued",
      pending: { clientId, body: trimmed, createdAt: new Date().toISOString(), failed: false },
    });

    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      dispatch({ type: "failed", clientId });
      return;
    }
    const event: ClientChatEvent = { type: "send", clientId, body: trimmed };
    socket.send(JSON.stringify(event));
  }, []);

  return { log, status, error, send };
}
