// HTTP side of chat: creating rooms, joining by invite code, listing your
// rooms, and reading history. Live delivery is in ../chat/hub.ts.
import type { ChatErrorCode, RoomResponse } from "@grugchug/shared";
import {
  CHAT_USER_HEADER,
  createRoomRequestSchema,
  joinRoomRequestSchema,
  MESSAGE_PAGE_SIZE,
  userIdSchema,
} from "@grugchug/shared";
import type { BunRequest, Server } from "bun";
import { guard } from "../chat/errors";
import { type ChatSocketData, newSocketData } from "../chat/hub";
import { newUserId } from "../chat/ids";
import {
  createRoom,
  findMember,
  findRoom,
  joinRoomByInviteCode,
  listMessages,
  listRoomsForUser,
} from "../chat/store";

// Who is calling. See CHAT_USER_HEADER in @grugchug/shared for the trust model.
function callerId(req: Request): string | null {
  const parsed = userIdSchema.safeParse(req.headers.get(CHAT_USER_HEADER) ?? "");
  return parsed.success ? parsed.data : null;
}

function problem(status: number, code: ChatErrorCode, detail?: string): Response {
  return Response.json({ error: code, detail }, { status });
}

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

async function createRoomImpl(req: BunRequest): Promise<Response> {
  const body = createRoomRequestSchema.safeParse(await readJson(req));
  if (!body.success) {
    return problem(400, "invalid_payload", body.error.issues[0]?.message);
  }

  // A first-time visitor has no identity yet; creating a room mints one.
  const userId = callerId(req) ?? newUserId();
  const result = await createRoom({ ...body.data, userId });
  return Response.json(result satisfies RoomResponse, { status: 201 });
}

async function joinRoomImpl(req: BunRequest): Promise<Response> {
  const body = joinRoomRequestSchema.safeParse(await readJson(req));
  if (!body.success) {
    return problem(400, "invalid_payload", body.error.issues[0]?.message);
  }

  const userId = callerId(req) ?? newUserId();
  const result = await joinRoomByInviteCode({ ...body.data, userId });
  if (!result) return problem(404, "not_found", "no room with that invite code");
  return Response.json(result satisfies RoomResponse);
}

async function listRoomsImpl(req: BunRequest): Promise<Response> {
  const userId = callerId(req);
  if (!userId) return problem(401, "unauthorized");
  return Response.json({ rooms: await listRoomsForUser(userId) });
}

async function getRoomImpl(req: BunRequest<"/api/chat/rooms/:roomId">): Promise<Response> {
  const userId = callerId(req);
  if (!userId) return problem(401, "unauthorized");

  // Non-members get "not found" rather than "forbidden": whether a room id
  // exists is not something a stranger should be able to probe.
  const member = await findMember(req.params.roomId, userId);
  if (!member) return problem(404, "not_found");

  const room = await findRoom(req.params.roomId);
  if (!room) return problem(404, "not_found");
  return Response.json({ room, member } satisfies RoomResponse);
}

async function listMessagesImpl(
  req: BunRequest<"/api/chat/rooms/:roomId/messages">,
): Promise<Response> {
  const userId = callerId(req);
  if (!userId) return problem(401, "unauthorized");

  const { roomId } = req.params;
  const member = await findMember(roomId, userId);
  if (!member) return problem(404, "not_found");

  const url = new URL(req.url);
  const before = url.searchParams.get("before") ?? undefined;
  const limitParam = Number(url.searchParams.get("limit") ?? MESSAGE_PAGE_SIZE);
  const limit = Number.isFinite(limitParam) ? limitParam : MESSAGE_PAGE_SIZE;

  return Response.json({ messages: await listMessages(roomId, { before, limit }) });
}

/**
 * WebSocket upgrade. Browsers cannot set headers on a WebSocket handshake, so
 * identity arrives as a query parameter here instead of in CHAT_USER_HEADER.
 * Membership is checked before the upgrade, which is the only gate the socket
 * ever gets: everything after this trusts ws.data.
 */
async function chatSocketImpl(
  req: BunRequest,
  server: Server<ChatSocketData>,
): Promise<Response | undefined> {
  const url = new URL(req.url);
  const roomId = url.searchParams.get("roomId") ?? "";
  const userId = userIdSchema.safeParse(url.searchParams.get("userId") ?? "");
  if (!roomId || !userId.success) return problem(400, "invalid_payload");

  const member = await findMember(roomId, userId.data);
  if (!member) return problem(401, "unauthorized");

  const upgraded = server.upgrade(req, {
    data: newSocketData({ roomId, userId: userId.data, displayName: member.displayName }),
  });
  if (upgraded) return undefined;
  return new Response("Expected a WebSocket upgrade", { status: 426 });
}

// Every handler is guarded: a store failure is logged with its stack and comes
// back as a readable 500 rather than an empty one.
export const createRoomRoute = guard("create room", createRoomImpl);
export const joinRoomRoute = guard("join room", joinRoomImpl);
export const listRoomsRoute = guard("list rooms", listRoomsImpl);
export const getRoomRoute = guard("get room", getRoomImpl);
export const listMessagesRoute = guard("list messages", listMessagesImpl);
export const chatSocketRoute = guard("socket upgrade", chatSocketImpl);
