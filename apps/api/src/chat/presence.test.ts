// The roster as the handler actually maintains it. The WebSocketHandler only
// ever calls `subscribe`, `unsubscribe` and `send` on a socket, so a plain
// object stands in for one and none of this needs a server or a database.
import { afterEach, beforeEach, expect, test } from "bun:test";
import type { ChatPresenceMember, ServerChatEvent } from "@grugchug/shared";
import type { ServerWebSocket } from "bun";
import { type ChatSocketData, chatWebSocket, newSocketData } from "./hub";

interface FakeSocket {
  sent: ServerChatEvent[];
  topics: Set<string>;
  ws: ServerWebSocket<ChatSocketData>;
}

function fake(userId: string, displayName: string, roomId = "r1"): FakeSocket {
  const sent: ServerChatEvent[] = [];
  const topics = new Set<string>();
  const ws = {
    data: newSocketData({ roomId, userId, displayName }),
    send: (raw: string) => sent.push(JSON.parse(raw) as ServerChatEvent),
    subscribe: (topic: string) => topics.add(topic),
    unsubscribe: (topic: string) => topics.delete(topic),
    publish: () => 0,
  } as unknown as ServerWebSocket<ChatSocketData>;
  return { sent, topics, ws };
}

function open(socket: FakeSocket): void {
  chatWebSocket.open?.(socket.ws);
}

function close(socket: FakeSocket): void {
  chatWebSocket.close?.(socket.ws, 1000, "");
}

/** The roster as of this socket's most recent presence frame. */
function roster(socket: FakeSocket): string[] {
  const last = [...socket.sent].reverse().find((event) => event.type === "presence");
  return last?.type === "presence" ? last.members.map((member) => member.displayName) : [];
}

/** The full presence members as of this socket's most recent frame. */
function presenceMembers(socket: FakeSocket): ChatPresenceMember[] {
  const last = [...socket.sent].reverse().find((event) => event.type === "presence");
  return last?.type === "presence" ? last.members : [];
}

let ada: FakeSocket;
let bob: FakeSocket;

beforeEach(() => {
  ada = fake("u1", "Ada");
  bob = fake("u2", "Bob");
});

// The registry is module state: a test that leaves someone connected haunts
// the next one.
afterEach(() => {
  close(ada);
  close(bob);
});

test("the first socket in a room sees only itself", () => {
  open(ada);
  expect(ada.sent[0]).toEqual({ type: "ready", roomId: "r1" });
  expect(ada.topics.has("chat:room:r1")).toBe(true);
  expect(roster(ada)).toEqual(["Ada"]);
});

test("someone arriving is announced to everyone, themselves included", () => {
  open(ada);
  open(bob);
  expect(roster(ada)).toEqual(["Ada", "Bob"]);
  expect(roster(bob)).toEqual(["Ada", "Bob"]);
});

test("someone leaving empties out of the roster", () => {
  open(ada);
  open(bob);
  close(bob);
  expect(roster(ada)).toEqual(["Ada"]);
});

test("a focus report reaches the room without spending the message budget", async () => {
  open(ada);
  open(bob);

  for (let i = 0; i < 50; i++) {
    await chatWebSocket.message(ada.ws, JSON.stringify({ type: "focus", efficiency: i / 100 }));
  }

  const last = [...bob.sent].reverse().find((event) => event.type === "presence");
  expect(last?.type === "presence" && last.members[0]?.efficiency).toBe(0.49);
  expect(bob.sent.some((event) => event.type === "error")).toBe(false);
});

test("a journey event reaches the room without spending the message budget", async () => {
  open(ada);
  open(bob);

  for (let i = 0; i < 50; i++) {
    await chatWebSocket.message(
      ada.ws,
      JSON.stringify({
        type: "journey",
        avatar: "cat",
        journey: { state: "at-station", station: { index: 2, total: 6 } },
      }),
    );
  }

  const members = presenceMembers(bob);
  const adaMember = members.find((member) => member.userId === "u1");
  const bobMember = members.find((member) => member.userId === "u2");
  expect(adaMember?.avatar).toBe("cat");
  expect(adaMember?.journey).toEqual({ state: "at-station", station: { index: 2, total: 6 } });
  expect(bobMember).not.toHaveProperty("avatar");
  expect(bobMember).not.toHaveProperty("journey");
  expect(bob.sent.some((event) => event.type === "error")).toBe(false);
});

test("rooms do not see each other", () => {
  const cy = fake("u3", "Cy", "r2");
  open(ada);
  open(cy);
  expect(roster(ada)).toEqual(["Ada"]);
  expect(roster(cy)).toEqual(["Cy"]);
  close(cy);
});
