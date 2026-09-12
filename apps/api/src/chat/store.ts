// MongoDB access for chat. Every function here returns shapes from
// @grugchug/shared, so dates leave this module as ISO strings and Mongo's
// document shape never escapes it.
import type { ChatMember, ChatMessage, ChatRoom } from "@grugchug/shared";
import { MESSAGE_PAGE_SIZE } from "@grugchug/shared";
import type { Collection } from "mongodb";
import { getDb } from "../db";
import { newId, newInviteCode } from "./ids";

interface RoomDoc {
  _id: string;
  name: string;
  inviteCode: string;
  createdBy: string;
  createdAt: Date;
}

// `joinedAt` is when this membership last came in through an invite link, not
// when it first existed. That is deliberate: it is what decides which room a
// browser is in, so following a link you have followed before moves you back.
interface MemberDoc {
  _id: string;
  roomId: string;
  userId: string;
  displayName: string;
  joinedAt: Date;
}

interface MessageDoc {
  _id: string;
  roomId: string;
  userId: string;
  displayName: string;
  body: string;
  createdAt: Date;
}

interface Collections {
  rooms: Collection<RoomDoc>;
  members: Collection<MemberDoc>;
  messages: Collection<MessageDoc>;
}

let indexesReady: Promise<void> | undefined;

async function collections(): Promise<Collections> {
  const db = await getDb();
  const rooms = db.collection<RoomDoc>("chatRooms");
  const members = db.collection<MemberDoc>("chatMembers");
  const messages = db.collection<MessageDoc>("chatMessages");

  // Built once per process. A failure clears the memo so the next request
  // retries instead of inheriting a permanently rejected promise.
  if (!indexesReady) {
    indexesReady = Promise.all([
      rooms.createIndex({ inviteCode: 1 }, { unique: true }),
      members.createIndex({ userId: 1, joinedAt: -1 }),
      members.createIndex({ roomId: 1 }),
      messages.createIndex({ roomId: 1, createdAt: -1, _id: -1 }),
    ])
      .then(() => undefined)
      .catch((error: unknown) => {
        indexesReady = undefined;
        throw error;
      });
  }
  await indexesReady;

  return { rooms, members, messages };
}

function memberKey(roomId: string, userId: string): string {
  return `${roomId}:${userId}`;
}

function toRoom(doc: RoomDoc): ChatRoom {
  return {
    id: doc._id,
    name: doc.name,
    inviteCode: doc.inviteCode,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt.toISOString(),
  };
}

function toMember(doc: MemberDoc): ChatMember {
  return {
    roomId: doc.roomId,
    userId: doc.userId,
    displayName: doc.displayName,
    joinedAt: doc.joinedAt.toISOString(),
  };
}

function toMessage(doc: MessageDoc): ChatMessage {
  return {
    id: doc._id,
    roomId: doc.roomId,
    userId: doc.userId,
    displayName: doc.displayName,
    body: doc.body,
    createdAt: doc.createdAt.toISOString(),
  };
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}

async function upsertMember(
  members: Collection<MemberDoc>,
  input: {
    roomId: string;
    userId: string;
    displayName: string;
    now: Date;
    /** An invite link was followed: make this the room the user is in. */
    entering?: boolean;
  },
): Promise<ChatMember> {
  // Joining twice is not an error: it re-enters and refreshes the display name.
  // joinedAt is written by exactly one operator — Mongo rejects an update that
  // touches the same path in both $set and $setOnInsert.
  const identity = { roomId: input.roomId, userId: input.userId };
  const doc = await members.findOneAndUpdate(
    { _id: memberKey(input.roomId, input.userId) },
    input.entering
      ? {
          $set: { displayName: input.displayName, joinedAt: input.now },
          $setOnInsert: identity,
        }
      : {
          $set: { displayName: input.displayName },
          $setOnInsert: { ...identity, joinedAt: input.now },
        },
    { upsert: true, returnDocument: "after" },
  );
  if (!doc) throw new Error("member upsert returned nothing");
  return toMember(doc);
}

// Nothing in the UI shows a room name any more — you are simply in a room, and
// the roster is what tells you whose. The column stays because the schema has
// it and because a future "name your study group" is a one-line change.
export const DEFAULT_ROOM_NAME = "Study room";

async function createRoom(input: {
  name: string;
  userId: string;
  displayName: string;
}): Promise<{ room: ChatRoom; member: ChatMember }> {
  const { rooms, members } = await collections();
  const now = new Date();
  const roomId = newId();

  // Invite codes are short enough to collide eventually; the unique index is
  // the arbiter and we simply draw again.
  let inserted: RoomDoc | undefined;
  for (let attempt = 0; attempt < 5 && !inserted; attempt += 1) {
    const candidate: RoomDoc = {
      _id: roomId,
      name: input.name,
      inviteCode: newInviteCode(),
      createdBy: input.userId,
      createdAt: now,
    };
    try {
      await rooms.insertOne(candidate);
      inserted = candidate;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }
  if (!inserted) throw new Error("could not allocate a unique invite code");

  const member = await upsertMember(members, {
    roomId,
    userId: input.userId,
    displayName: input.displayName,
    now,
  });
  return { room: toRoom(inserted), member };
}

export async function joinRoomByInviteCode(input: {
  inviteCode: string;
  userId: string;
  displayName: string;
}): Promise<{ room: ChatRoom; member: ChatMember } | null> {
  const { rooms, members } = await collections();
  const doc = await rooms.findOne({ inviteCode: input.inviteCode });
  if (!doc) return null;

  const member = await upsertMember(members, {
    roomId: doc._id,
    userId: input.userId,
    displayName: input.displayName,
    now: new Date(),
    entering: true,
  });
  return { room: toRoom(doc), member };
}

/**
 * The one room this browser is in: the most recently joined, or a brand new
 * one for a first-time visitor. Every visit refreshes the display name, so the
 * name field at the top of the chat is the only thing that sets it.
 */
export async function findOrCreateRoomForUser(input: {
  userId: string;
  displayName: string;
}): Promise<{ room: ChatRoom; member: ChatMember }> {
  const { rooms, members } = await collections();
  const membership = await members
    .find({ userId: input.userId })
    .sort({ joinedAt: -1 })
    .limit(1)
    .next();

  if (membership) {
    const doc = await rooms.findOne({ _id: membership.roomId });
    // A membership whose room is gone is not an error: fall through and make
    // a fresh room rather than stranding the user with nowhere to talk.
    if (doc) {
      const member = await upsertMember(members, {
        roomId: doc._id,
        userId: input.userId,
        displayName: input.displayName,
        now: new Date(),
      });
      return { room: toRoom(doc), member };
    }
  }

  return createRoom({ name: DEFAULT_ROOM_NAME, ...input });
}

/** Renaming yourself renames you everywhere you are a member. */
export async function setDisplayName(userId: string, displayName: string): Promise<void> {
  const { members } = await collections();
  await members.updateMany({ userId }, { $set: { displayName } });
}

export async function findMember(roomId: string, userId: string): Promise<ChatMember | null> {
  const { members } = await collections();
  const doc = await members.findOne({ _id: memberKey(roomId, userId) });
  return doc ? toMember(doc) : null;
}

export async function listMessages(
  roomId: string,
  options: { before?: string; limit?: number } = {},
): Promise<ChatMessage[]> {
  const { messages } = await collections();
  const limit = Math.min(Math.max(options.limit ?? MESSAGE_PAGE_SIZE, 1), 200);

  // Paging by (createdAt, _id) rather than by timestamp alone, so messages
  // that land in the same millisecond are never skipped at a page boundary.
  let filter: Record<string, unknown> = { roomId };
  if (options.before) {
    const anchor = await messages.findOne({ _id: options.before, roomId });
    if (!anchor) return [];
    filter = {
      roomId,
      $or: [
        { createdAt: { $lt: anchor.createdAt } },
        { createdAt: anchor.createdAt, _id: { $lt: anchor._id } },
      ],
    };
  }

  const docs = await messages.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).toArray();
  return docs.reverse().map(toMessage);
}

export async function insertMessage(input: {
  roomId: string;
  userId: string;
  displayName: string;
  body: string;
}): Promise<ChatMessage> {
  const { messages } = await collections();
  const doc: MessageDoc = {
    _id: newId(),
    roomId: input.roomId,
    userId: input.userId,
    displayName: input.displayName,
    body: input.body,
    createdAt: new Date(),
  };
  await messages.insertOne(doc);
  return toMessage(doc);
}
