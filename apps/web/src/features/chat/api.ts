// HTTP client for chat. Responses are parsed with the shared schemas so a
// drifting API surfaces here rather than deep inside a component.
import type {
  ChatMessage,
  ChatRoom,
  MessagesResponse,
  RoomListResponse,
  RoomResponse,
} from "@grugchug/shared";
import {
  CHAT_USER_HEADER,
  messagesResponseSchema,
  roomListResponseSchema,
  roomResponseSchema,
} from "@grugchug/shared";

/**
 * Just enough of a zod schema to validate a response. Structural rather than
 * an import, so apps/web does not take a direct dependency on zod — the
 * schemas come from @grugchug/shared and the types come with them.
 */
interface ResponseParser<T> {
  parse: (value: unknown) => T;
}

export class ChatApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
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

export function createRoom(input: {
  name: string;
  displayName: string;
  userId: string | null;
}): Promise<RoomResponse> {
  return request("/chat/rooms", roomResponseSchema, {
    method: "POST",
    userId: input.userId,
    body: JSON.stringify({ name: input.name, displayName: input.displayName }),
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

export async function listRooms(userId: string): Promise<ChatRoom[]> {
  const body: RoomListResponse = await request("/chat/rooms", roomListResponseSchema, { userId });
  return body.rooms;
}

export function getRoom(roomId: string, userId: string): Promise<RoomResponse> {
  return request(`/chat/rooms/${encodeURIComponent(roomId)}`, roomResponseSchema, { userId });
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

export function inviteLink(inviteCode: string): string {
  return `${window.location.origin}/chat/join/${inviteCode}`;
}
