import { z } from "zod";
import { journeySchema } from "./journey";
import { avatarIdSchema } from "./user";

// Chat: one room at a time, the people connected to it, and what they say.
// Everything here crosses the HTTP or WebSocket boundary, or is stored.
//
// A browser is in exactly one room: the last one it joined. The server hands
// that room back on request and creates one the first time, so there is no
// room list, no room picker, and no joining by typing a code — the invite
// link is the only way into someone else's room.

export const MESSAGE_MAX_LENGTH = 2000;
export const DISPLAY_NAME_MAX_LENGTH = 40;
export const ROOM_NAME_MAX_LENGTH = 60;
export const INVITE_CODE_LENGTH = 8;
export const MESSAGE_PAGE_SIZE = 50;

// Identity header both apps agree on. Auth is deferred repo-wide, so a userId
// is a long random string the server minted and the client stores: unguessable,
// but not authenticated. Do not put anything behind it that real auth guards.
export const CHAT_USER_HEADER = "x-grugchug-user";

// Invite codes are typed and read aloud, so the alphabet drops the glyphs
// people confuse: I, L, O, U, 0, 1.
export const INVITE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

export const userIdSchema = z.string().min(1).max(64);
export const displayNameSchema = z.string().trim().min(1).max(DISPLAY_NAME_MAX_LENGTH);
export const roomNameSchema = z.string().trim().min(1).max(ROOM_NAME_MAX_LENGTH);
export const messageBodySchema = z.string().trim().min(1).max(MESSAGE_MAX_LENGTH);

export const inviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    new RegExp(`^[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`),
    "invite code must be 8 unambiguous characters",
  );

// A room is the whole unit of access: being a member of one is what lets you
// read and post. There is no friends list; presence is live-only and never
// stored (see chatPresenceMemberSchema).
export const chatRoomSchema = z.object({
  id: z.string(),
  name: roomNameSchema,
  inviteCode: inviteCodeSchema,
  createdBy: userIdSchema,
  createdAt: z.iso.datetime(),
});

export const chatMemberSchema = z.object({
  roomId: z.string(),
  userId: userIdSchema,
  displayName: displayNameSchema,
  joinedAt: z.iso.datetime(),
});

// displayName is denormalized onto the message so history renders without a
// second lookup, and so a later rename does not rewrite what was already said.
export const chatMessageSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  userId: userIdSchema,
  displayName: displayNameSchema,
  body: messageBodySchema,
  createdAt: z.iso.datetime(),
});

// Who is connected to the room right now, and how their study is going. This
// is never stored: it is derived from the open sockets and dies with them.
// `efficiency` is the 0..1 study score, the same number a train runs on, so a
// friend's train can pull ahead or fall behind on screen.
export const chatPresenceMemberSchema = z.object({
  userId: userIdSchema,
  displayName: displayNameSchema,
  efficiency: z.number().min(0).max(1),
  // The rider's picked character and where they are on their route. Optional
  // on the wire so an older client that never sends them still parses.
  avatar: avatarIdSchema.optional(),
  journey: journeySchema.optional(),
});

export type ChatRoom = z.infer<typeof chatRoomSchema>;
export type ChatMember = z.infer<typeof chatMemberSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatPresenceMember = z.infer<typeof chatPresenceMemberSchema>;

/* HTTP bodies */

// "Give me my room." The server returns the last room this user joined, and
// creates one the first time. Nothing names a room, because nothing shows it.
export const myRoomRequestSchema = z.object({
  displayName: displayNameSchema,
});

export const joinRoomRequestSchema = z.object({
  inviteCode: inviteCodeSchema,
  displayName: displayNameSchema,
});

// Every room response carries the caller's identity back, because creating or
// joining a room is also how a first-time visitor gets a userId at all.
export const roomResponseSchema = z.object({
  room: chatRoomSchema,
  member: chatMemberSchema,
});

export const messagesResponseSchema = z.object({
  messages: z.array(chatMessageSchema),
});

export type MyRoomRequest = z.infer<typeof myRoomRequestSchema>;
export type JoinRoomRequest = z.infer<typeof joinRoomRequestSchema>;
export type RoomResponse = z.infer<typeof roomResponseSchema>;
export type MessagesResponse = z.infer<typeof messagesResponseSchema>;

/* WebSocket wire protocol */

export const chatErrorCodeSchema = z.enum([
  "unauthorized",
  "not_found",
  "invalid_payload",
  "rate_limited",
  "server_error",
]);

export type ChatErrorCode = z.infer<typeof chatErrorCodeSchema>;

// clientId is the sender's own id for an optimistic bubble. The server echoes
// it back on that sender's copy so the client can swap the optimistic message
// for the stored one instead of showing it twice.
export const clientChatEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("send"),
    clientId: z.string().min(1).max(64),
    body: messageBodySchema,
  }),
  // Renaming yourself. It changes the name on your membership and on the
  // presence roster from here on; messages already said keep the old one.
  z.object({
    type: z.literal("rename"),
    displayName: displayNameSchema,
  }),
  // Your study score, so the room can draw your train. Sent often enough to
  // look live and rarely enough not to be chat traffic — the client throttles.
  z.object({
    type: z.literal("focus"),
    efficiency: z.number().min(0).max(1),
  }),
  // Where you are on your route and what you look like, so the room can draw
  // your train stopping at a station with your own avatar in the cart.
  z.object({
    type: z.literal("journey"),
    avatar: avatarIdSchema,
    journey: journeySchema,
  }),
]);

export const serverChatEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready"), roomId: z.string() }),
  z.object({
    type: z.literal("message"),
    message: chatMessageSchema,
    clientId: z.string().nullable(),
  }),
  // The whole roster every time, not a diff: it is a handful of people, and a
  // client that reconnects mid-change should not have to reconcile anything.
  z.object({
    type: z.literal("presence"),
    members: z.array(chatPresenceMemberSchema),
  }),
  z.object({
    type: z.literal("error"),
    code: chatErrorCodeSchema,
    detail: z.string().optional(),
  }),
]);

export type ClientChatEvent = z.infer<typeof clientChatEventSchema>;
export type ServerChatEvent = z.infer<typeof serverChatEventSchema>;
