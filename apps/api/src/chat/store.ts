// SQLite access for chat. Every function returns shapes from @grugchug/shared,
// and every date is stored as the ISO string the schemas already carry.
import type { Database } from "bun:sqlite";
import type { ChatMember, ChatMessage, ChatRoom } from "@grugchug/shared";
import { MESSAGE_PAGE_SIZE } from "@grugchug/shared";
import { getDatabase } from "../db";
import { newId, newInviteCode } from "./ids";

type RoomRow = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
};

// `joined_at` is when this membership last came in through an invite link, not
// when it first existed. That is deliberate: it is what decides which room a
// browser is in, so following a link you have followed before moves you back.
type MemberRow = { room_id: string; user_id: string; display_name: string; joined_at: string };

type MessageRow = {
  id: string;
  room_id: string;
  user_id: string;
  display_name: string;
  body: string;
  created_at: string;
};

const ROOM_COLUMNS = "id, name, invite_code, created_by, created_at";
const MEMBER_COLUMNS = "room_id, user_id, display_name, joined_at";
const MESSAGE_COLUMNS = "id, room_id, user_id, display_name, body, created_at";

function toRoom(row: RoomRow): ChatRoom {
  return {
    id: row.id,
    name: row.name,
    inviteCode: row.invite_code,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function toMember(row: MemberRow): ChatMember {
  return {
    roomId: row.room_id,
    userId: row.user_id,
    displayName: row.display_name,
    joinedAt: row.joined_at,
  };
}

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    roomId: row.room_id,
    userId: row.user_id,
    displayName: row.display_name,
    body: row.body,
    createdAt: row.created_at,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

function upsertMember(
  db: Database,
  input: {
    roomId: string;
    userId: string;
    displayName: string;
    now: string;
    /** An invite link was followed: make this the room the user is in. */
    entering?: boolean;
  },
): ChatMember {
  // Joining twice is not an error: it re-enters and refreshes the display name.
  const sql = input.entering
    ? `INSERT INTO chat_members (${MEMBER_COLUMNS}) VALUES (?, ?, ?, ?)
       ON CONFLICT(room_id, user_id) DO UPDATE SET
         display_name = excluded.display_name, joined_at = excluded.joined_at
       RETURNING ${MEMBER_COLUMNS}`
    : `INSERT INTO chat_members (${MEMBER_COLUMNS}) VALUES (?, ?, ?, ?)
       ON CONFLICT(room_id, user_id) DO UPDATE SET display_name = excluded.display_name
       RETURNING ${MEMBER_COLUMNS}`;
  const row = db
    .query<MemberRow, [string, string, string, string]>(sql)
    .get(input.roomId, input.userId, input.displayName, input.now);
  if (!row) throw new Error("member upsert returned nothing");
  return toMember(row);
}

// Nothing in the UI shows a room name any more — you are simply in a room, and
// the roster is what tells you whose. The column stays because the schema has
// it and because a future "name your study group" is a one-line change.
export const DEFAULT_ROOM_NAME = "Study room";

function createRoom(
  db: Database,
  input: { name: string; userId: string; displayName: string },
): { room: ChatRoom; member: ChatMember } {
  const now = new Date().toISOString();
  const roomId = newId();
  const insert = db.query<RoomRow, [string, string, string, string, string]>(
    `INSERT INTO chat_rooms (${ROOM_COLUMNS}) VALUES (?, ?, ?, ?, ?) RETURNING ${ROOM_COLUMNS}`,
  );

  // Invite codes are short enough to collide eventually; the unique constraint
  // is the arbiter and we simply draw again.
  let inserted: RoomRow | null = null;
  for (let attempt = 0; attempt < 5 && !inserted; attempt += 1) {
    try {
      inserted = insert.get(roomId, input.name, newInviteCode(), input.userId, now);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  if (!inserted) throw new Error("could not allocate a unique invite code");

  const member = upsertMember(db, {
    roomId,
    userId: input.userId,
    displayName: input.displayName,
    now,
  });
  return { room: toRoom(inserted), member };
}

export async function joinRoomByInviteCode(
  input: { inviteCode: string; userId: string; displayName: string },
  db: Database = getDatabase(),
): Promise<{ room: ChatRoom; member: ChatMember } | null> {
  const row = db
    .query<RoomRow, [string]>(`SELECT ${ROOM_COLUMNS} FROM chat_rooms WHERE invite_code = ?`)
    .get(input.inviteCode);
  if (!row) return null;

  const member = upsertMember(db, {
    roomId: row.id,
    userId: input.userId,
    displayName: input.displayName,
    now: new Date().toISOString(),
    entering: true,
  });
  return { room: toRoom(row), member };
}

/**
 * The one room this browser is in: the most recently joined, or a brand new
 * one for a first-time visitor. Every visit refreshes the display name, so the
 * name field at the top of the chat is the only thing that sets it.
 */
export async function findOrCreateRoomForUser(
  input: { userId: string; displayName: string },
  db: Database = getDatabase(),
): Promise<{ room: ChatRoom; member: ChatMember }> {
  // Tie-broken by rowid (SQLite's implicit, monotonically-assigned row id):
  // two joins landing in the same millisecond are common enough under fast,
  // synchronous SQLite access that joined_at alone is not a reliable "most
  // recent" ordering, and rowid DESC recovers insertion order for the tie.
  const membership = db
    .query<MemberRow, [string]>(
      `SELECT ${MEMBER_COLUMNS} FROM chat_members WHERE user_id = ?
       ORDER BY joined_at DESC, rowid DESC LIMIT 1`,
    )
    .get(input.userId);

  if (membership) {
    const row = db
      .query<RoomRow, [string]>(`SELECT ${ROOM_COLUMNS} FROM chat_rooms WHERE id = ?`)
      .get(membership.room_id);
    // A membership whose room is gone is not an error: fall through and make
    // a fresh room rather than stranding the user with nowhere to talk.
    if (row) {
      const member = upsertMember(db, {
        roomId: row.id,
        userId: input.userId,
        displayName: input.displayName,
        now: new Date().toISOString(),
      });
      return { room: toRoom(row), member };
    }
  }

  return createRoom(db, { name: DEFAULT_ROOM_NAME, ...input });
}

/** Renaming yourself renames you everywhere you are a member. */
export async function setDisplayName(
  userId: string,
  displayName: string,
  db: Database = getDatabase(),
): Promise<void> {
  db.query("UPDATE chat_members SET display_name = ? WHERE user_id = ?").run(displayName, userId);
}

export async function findMember(
  roomId: string,
  userId: string,
  db: Database = getDatabase(),
): Promise<ChatMember | null> {
  const row = db
    .query<MemberRow, [string, string]>(
      `SELECT ${MEMBER_COLUMNS} FROM chat_members WHERE room_id = ? AND user_id = ?`,
    )
    .get(roomId, userId);
  return row ? toMember(row) : null;
}

export async function listMessages(
  roomId: string,
  options: { before?: string; limit?: number } = {},
  db: Database = getDatabase(),
): Promise<ChatMessage[]> {
  const limit = Math.min(Math.max(options.limit ?? MESSAGE_PAGE_SIZE, 1), 200);

  // Paging by (created_at, id) rather than by timestamp alone, so messages
  // that land in the same millisecond are never skipped at a page boundary.
  let rows: MessageRow[];
  if (options.before) {
    const anchor = db
      .query<{ created_at: string; id: string }, [string, string]>(
        "SELECT created_at, id FROM chat_messages WHERE id = ? AND room_id = ?",
      )
      .get(options.before, roomId);
    if (!anchor) return [];
    rows = db
      .query<MessageRow, [string, string, string, string, number]>(
        `SELECT ${MESSAGE_COLUMNS} FROM chat_messages
         WHERE room_id = ? AND (created_at < ? OR (created_at = ? AND id < ?))
         ORDER BY created_at DESC, id DESC LIMIT ?`,
      )
      .all(roomId, anchor.created_at, anchor.created_at, anchor.id, limit);
  } else {
    rows = db
      .query<MessageRow, [string, number]>(
        `SELECT ${MESSAGE_COLUMNS} FROM chat_messages WHERE room_id = ?
         ORDER BY created_at DESC, id DESC LIMIT ?`,
      )
      .all(roomId, limit);
  }
  return rows.reverse().map(toMessage);
}

export async function insertMessage(
  input: { roomId: string; userId: string; displayName: string; body: string },
  db: Database = getDatabase(),
): Promise<ChatMessage> {
  const row: MessageRow = {
    id: newId(),
    room_id: input.roomId,
    user_id: input.userId,
    display_name: input.displayName,
    body: input.body,
    created_at: new Date().toISOString(),
  };
  db.query(`INSERT INTO chat_messages (${MESSAGE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`).run(
    row.id,
    row.room_id,
    row.user_id,
    row.display_name,
    row.body,
    row.created_at,
  );
  return toMessage(row);
}
