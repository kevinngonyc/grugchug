// Owns the room's live socket: connect, reconnect, and turn frames into
// message-log actions and roster updates. All ordering and de-duplication
// lives in message-log; the roster lives in roster.ts.
//
// The socket is the room's presence, so this hook stays mounted for the whole
// session whether or not the panel is open — closing the chat must not park
// everyone else's train.
import type { ClientChatEvent } from "@grugchug/shared";
import { serverChatEventSchema } from "@grugchug/shared";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { chatSocketUrl, listMessages } from "./api";
import { setFocusSink } from "./focus-link";
import { setJourneySink } from "./journey-link";
import { type ChatLog, chatLogReducer, emptyChatLog } from "./message-log";
import { useRosterStore } from "./roster";

export type ChatConnectionStatus = "connecting" | "open" | "offline";

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;

export interface ChatRoomConnection {
  log: ChatLog;
  status: ChatConnectionStatus;
  error: string | null;
  send: (body: string) => void;
  /** Tell the room what to call you from now on. */
  rename: (displayName: string) => void;
}

/** `roomId` is null until the room has been resolved; nothing connects until then. */
export function useChatRoom(roomId: string | null, userId: string | null): ChatRoomConnection {
  const [log, dispatch] = useReducer(chatLogReducer, emptyChatLog);
  const [status, setStatus] = useState<ChatConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  /** Fire-and-forget: anything sent while the socket is down is simply lost.
   * Only messages are worth reporting as failed, and they say so themselves. */
  const sendEvent = useCallback((event: ClientChatEvent): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(event));
    return true;
  }, []);

  useEffect(() => {
    if (!roomId || !userId) return;

    dispatch({ type: "reset" });
    let disposed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | undefined;

    // Pulled on every (re)connect, not just on mount: a socket that dropped
    // may have missed messages, and merging history is idempotent.
    async function loadHistory(): Promise<void> {
      if (!roomId || !userId) return;
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
        case "presence":
          useRosterStore.getState().setMembers(parsed.data.members);
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
      if (disposed || !roomId || !userId) return;
      setStatus("connecting");
      socket = new WebSocket(chatSocketUrl(roomId, userId));
      socketRef.current = socket;

      socket.onopen = () => {
        attempt = 0;
        setStatus("open");
        setError(null);
        // Only an open socket can carry the score, and only this one: a stale
        // connection's sink is replaced rather than left to write into a
        // closed socket.
        setFocusSink((efficiency) => sendEvent({ type: "focus", efficiency }));
        setJourneySink((status) => sendEvent({ type: "journey", ...status }));
        void loadHistory();
      };
      socket.onmessage = (event: MessageEvent<string>) => handleFrame(event.data);
      socket.onclose = () => {
        socketRef.current = null;
        setFocusSink(null);
        setJourneySink(null);
        // Presence is what the socket carries; without one we know nothing
        // about who else is here, so the room empties rather than going stale.
        useRosterStore.getState().clear();
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
      setFocusSink(null);
      setJourneySink(null);
      useRosterStore.getState().clear();
      if (socket) dispose(socket);
    };
    // sendEvent is stable, so it never re-opens the socket; it is listed
    // because the focus sink closes over it.
  }, [roomId, userId, sendEvent]);

  const send = useCallback(
    (body: string) => {
      const trimmed = body.trim();
      if (!trimmed) return;

      const clientId = crypto.randomUUID();
      dispatch({
        type: "queued",
        pending: { clientId, body: trimmed, createdAt: new Date().toISOString(), failed: false },
      });
      if (!sendEvent({ type: "send", clientId, body: trimmed })) {
        dispatch({ type: "failed", clientId });
      }
    },
    [sendEvent],
  );

  const rename = useCallback(
    (displayName: string) => {
      const trimmed = displayName.trim();
      // A name that never reached the server is not lost: the next load sends
      // the stored one back with the room request.
      if (trimmed) sendEvent({ type: "rename", displayName: trimmed });
    },
    [sendEvent],
  );

  return { log, status, error, send, rename };
}
