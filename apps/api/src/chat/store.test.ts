import { describe, expect, test } from "bun:test";
import { openDatabase } from "../db";
import {
  DEFAULT_ROOM_NAME,
  findMember,
  findOrCreateRoomForUser,
  insertMessage,
  joinRoomByInviteCode,
  listMessages,
  setDisplayName,
} from "./store";

const ada = { userId: "ada", displayName: "Ada" };
const bob = { userId: "bob", displayName: "Bob" };

describe("chat store", () => {
  test("a first-time visitor gets a fresh room they are a member of", async () => {
    const db = openDatabase(":memory:");
    const { room, member } = await findOrCreateRoomForUser(ada, db);
    expect(room.name).toBe(DEFAULT_ROOM_NAME);
    expect(room.createdBy).toBe("ada");
    expect(room.inviteCode.length).toBeGreaterThan(0);
    expect(member).toMatchObject({ roomId: room.id, userId: "ada", displayName: "Ada" });
    expect(await findMember(room.id, "ada", db)).toEqual(member);
  });

  test("coming back returns the same room and refreshes the display name", async () => {
    const db = openDatabase(":memory:");
    const first = await findOrCreateRoomForUser(ada, db);
    const again = await findOrCreateRoomForUser({ userId: "ada", displayName: "Ada L." }, db);
    expect(again.room.id).toBe(first.room.id);
    expect(again.member.displayName).toBe("Ada L.");
    expect(again.member.joinedAt).toBe(first.member.joinedAt);
  });

  test("joining by invite code enters that room and it becomes your current room", async () => {
    const db = openDatabase(":memory:");
    const adas = await findOrCreateRoomForUser(ada, db);
    const bobs = await findOrCreateRoomForUser(bob, db);
    expect(bobs.room.id).not.toBe(adas.room.id);

    const joined = await joinRoomByInviteCode({ inviteCode: adas.room.inviteCode, ...bob }, db);
    expect(joined?.room.id).toBe(adas.room.id);
    expect(joined?.member.userId).toBe("bob");

    const current = await findOrCreateRoomForUser(bob, db);
    expect(current.room.id).toBe(adas.room.id);
  });

  test("an unknown invite code is null", async () => {
    const db = openDatabase(":memory:");
    expect(await joinRoomByInviteCode({ inviteCode: "nope", ...bob }, db)).toBeNull();
  });

  test("renaming yourself renames every membership", async () => {
    const db = openDatabase(":memory:");
    const adas = await findOrCreateRoomForUser(ada, db);
    const bobs = await findOrCreateRoomForUser(bob, db);
    await joinRoomByInviteCode({ inviteCode: bobs.room.inviteCode, ...ada }, db);
    await setDisplayName("ada", "Countess", db);
    expect((await findMember(adas.room.id, "ada", db))?.displayName).toBe("Countess");
    expect((await findMember(bobs.room.id, "ada", db))?.displayName).toBe("Countess");
  });

  test("messages page backwards without skipping a same-millisecond boundary", async () => {
    const db = openDatabase(":memory:");
    const { room } = await findOrCreateRoomForUser(ada, db);
    const sent = [];
    for (let i = 0; i < 5; i++) {
      sent.push(await insertMessage({ roomId: room.id, ...ada, body: `m${i}` }, db));
    }
    // Bun's synchronous SQLite access is fast enough that all five inserts can
    // land in the same millisecond, so relying on wall-clock time to order
    // them would make this test's premise (m0 < m1 < {m2,m3} < m4) unreliable.
    // Pin created_at explicitly instead, tying only m2 and m3 as intended.
    const base = Date.parse(sent[0]?.createdAt ?? new Date().toISOString());
    const at = (offsetMs: number) => new Date(base + offsetMs).toISOString();
    for (const [body, offsetMs] of [
      ["m0", 0],
      ["m1", 1],
      ["m2", 2],
      ["m3", 2],
      ["m4", 3],
    ] as const) {
      db.run("UPDATE chat_messages SET created_at = ? WHERE body = ?", [at(offsetMs), body]);
    }

    // newId() is crypto.randomUUID(), so which of m2/m3 sorts higher is not
    // fixed from run to run. The invariant under test is not "m3 before m2"
    // but that ties at (created_at, id) never drop or repeat a message across
    // a page boundary, so we resolve the tie order from the actual ids rather
    // than hard-coding one direction.
    const m2Id = sent[2]?.id ?? "";
    const m3Id = sent[3]?.id ?? "";
    const [tiedFirst, tiedSecond] = m3Id > m2Id ? ["m3", "m2"] : ["m2", "m3"];

    const latest = await listMessages(room.id, { limit: 2 }, db);
    expect(latest.map((m) => m.body)).toEqual([tiedFirst, "m4"]);

    const older = await listMessages(room.id, { limit: 2, before: latest[0]?.id }, db);
    expect(older.map((m) => m.body)).toEqual(["m1", tiedSecond]);

    const oldest = await listMessages(room.id, { limit: 5, before: older[0]?.id }, db);
    expect(oldest.map((m) => m.body)).toEqual(["m0"]);

    expect(await listMessages(room.id, { before: "not-a-message" }, db)).toEqual([]);
  });
});
