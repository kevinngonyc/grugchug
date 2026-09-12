// HTTP client for chat. Responses are parsed with the shared schemas so a
// drifting API surfaces here rather than deep inside a component.
import type { ChatMessage, MessagesResponse, RoomResponse } from "@grugchug/shared";
import { CHAT_USER_HEADER, messagesResponseSchema, roomResponseSchema } from "@grugchug/shared";

/**
 * Just enough of a zod schema to validate a response. Structural rather than
 * an import, so apps/web does not take a direct dependency on zod — the
 * schemas come from @grugchug/shared and the types come with them.
 */
interface ResponseParser<T> {
  parse: (value: unknown) => T;
}

export class ChatApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ChatApiError";
  }
}

async function request<T>(
  path: string,
  schema: ResponseParser<T>,
  init: RequestInit & { userId?: string | null } = {},
): Promise<T> {
  const { userId, headers, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: {
      ...(rest.body ? { "content-type": "application/json" } : {}),
      ...(userId ? { [CHAT_USER_HEADER]: userId } : {}),
      ...headers,
    },
  });

  if (!res.ok) {
    const detail = await res
      .json()
      .then((body: { detail?: string; error?: string }) => body.detail ?? body.error)
      .catch(() => undefined);
    throw new ChatApiError(detail ?? `request failed (${res.status})`, res.status);
  }
  return schema.parse(await res.json());
}

/**
 * The one room this browser is in, created on the first call. Also how a
 * first-time visitor gets a userId at all, and how a name set here last time
 * is carried back onto the membership.
 */
export function myRoom(input: {
  displayName: string;
  userId: string | null;
}): Promise<RoomResponse> {
  return request("/chat/room", roomResponseSchema, {
    method: "POST",
    userId: input.userId,
    body: JSON.stringify({ displayName: input.displayName }),
  });
}

export function joinRoom(input: {
  inviteCode: string;
  displayName: string;
  userId: string | null;
}): Promise<RoomResponse> {
  return request("/chat/rooms/join", roomResponseSchema, {
    method: "POST",
    userId: input.userId,
    body: JSON.stringify({ inviteCode: input.inviteCode, displayName: input.displayName }),
  });
}

export async function listMessages(
  roomId: string,
  userId: string,
  options: { before?: string } = {},
): Promise<ChatMessage[]> {
  const query = options.before ? `?before=${encodeURIComponent(options.before)}` : "";
  const body: MessagesResponse = await request(
    `/chat/rooms/${encodeURIComponent(roomId)}/messages${query}`,
    messagesResponseSchema,
    { userId },
  );
  return body.messages;
}

/** Same origin as the page, so Vite's dev proxy carries the socket too. */
export function chatSocketUrl(roomId: string, userId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams({ roomId, userId });
  return `${protocol}//${window.location.host}/api/chat/ws?${params.toString()}`;
}

/**
 * The only way into someone else's room: opening it joins and lands you in the
 * session, so there is no code to read out and nothing to type.
 */
export function inviteLink(inviteCode: string): string {
  return `${window.location.origin}/chat/join/${inviteCode}`;
}
