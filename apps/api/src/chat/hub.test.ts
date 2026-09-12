import { expect, test } from "bun:test";
import { decodeClientEvent, encode, newSocketData, roomTopic, toPresence } from "./hub";

test("rooms get their own topic", () => {
  expect(roomTopic("r1")).toBe("chat:room:r1");
  expect(roomTopic("r1")).not.toBe(roomTopic("r2"));
});

test("decodes a well-formed send", () => {
  const result = decodeClientEvent(JSON.stringify({ type: "send", clientId: "c1", body: "hi" }));
  expect(result).toEqual({ ok: true, event: { type: "send", clientId: "c1", body: "hi" } });
});

test("rejects malformed frames without throwing", () => {
  expect(decodeClientEvent("not json").ok).toBe(false);
  expect(decodeClientEvent(JSON.stringify({ type: "send" })).ok).toBe(false);
  expect(decodeClientEvent(JSON.stringify({ type: "nope", clientId: "c" })).ok).toBe(false);
  expect(decodeClientEvent(JSON.stringify({ type: "send", clientId: "c", body: "  " })).ok).toBe(
    false,
  );
});

test("encodes server events as JSON the client can parse", () => {
  expect(JSON.parse(encode({ type: "ready", roomId: "r1", connectionId: "c1" }))).toEqual({
    type: "ready",
    roomId: "r1",
    connectionId: "c1",
  });
});

test("each socket gets its own rate limiter, and starts with no score", () => {
  const a = newSocketData({ roomId: "r1", userId: "u1", displayName: "Ada" });
  const b = newSocketData({ roomId: "r1", userId: "u2", displayName: "Bob" });
  expect(a.limiter).not.toBe(b.limiter);
  expect(a.displayName).toBe("Ada");
  expect(a.efficiency).toBe(0);
});

test("decodes a rename and a focus report", () => {
  expect(decodeClientEvent(JSON.stringify({ type: "rename", displayName: " Ada " }))).toEqual({
    ok: true,
    event: { type: "rename", displayName: "Ada" },
  });
  expect(decodeClientEvent(JSON.stringify({ type: "focus", efficiency: 0.4 })).ok).toBe(true);
  expect(decodeClientEvent(JSON.stringify({ type: "rename", displayName: " " })).ok).toBe(false);
  expect(decodeClientEvent(JSON.stringify({ type: "focus", efficiency: 2 })).ok).toBe(false);
});

test("the roster is one entry per open socket, in arrival order", () => {
  const ada = newSocketData({ roomId: "r1", userId: "u1", displayName: "Ada" });
  const bob = newSocketData({ roomId: "r1", userId: "u2", displayName: "Bob" });
  ada.efficiency = 0.7;
  expect(toPresence([ada, bob])).toEqual([
    { connectionId: ada.connectionId, userId: "u1", displayName: "Ada", efficiency: 0.7 },
    { connectionId: bob.connectionId, userId: "u2", displayName: "Bob", efficiency: 0 },
  ]);
});

test("two tabs of one browser are two riders, not one", () => {
  // They share a stored userId, so folding the roster by userId would leave
  // one entry — and each tab would see a room containing only itself.
  const first = newSocketData({ roomId: "r1", userId: "u1", displayName: "Ada" });
  const second = newSocketData({ roomId: "r1", userId: "u1", displayName: "Ada" });
  expect(first.connectionId).not.toBe(second.connectionId);
  expect(toPresence([first, second])).toHaveLength(2);
});
