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
  expect(JSON.parse(encode({ type: "ready", roomId: "r1" }))).toEqual({
    type: "ready",
    roomId: "r1",
  });
});

test("each socket gets its own rate limiter, and starts with no score", () => {
  const a = newSocketData({ roomId: "r1", userId: "u1", displayName: "Ada" });
  const b = newSocketData({ roomId: "r1", userId: "u2", displayName: "Bob" });
  expect(a.limiter).not.toBe(b.limiter);
  expect(a.displayName).toBe("Ada");
  expect(a.efficiency).toBe(0);
  expect(a.focusedSeconds).toBe(0);
});

test("decodes a rename and a focus report", () => {
  expect(decodeClientEvent(JSON.stringify({ type: "rename", displayName: " Ada " }))).toEqual({
    ok: true,
    event: { type: "rename", displayName: "Ada" },
  });
  expect(decodeClientEvent(JSON.stringify({ type: "focus", efficiency: 0.4 })).ok).toBe(true);
  expect(
    decodeClientEvent(JSON.stringify({ type: "focus", efficiency: 0.4, focusedSeconds: 12 })).ok,
  ).toBe(true);
  expect(
    decodeClientEvent(JSON.stringify({ type: "focus", efficiency: 0.4, focusedSeconds: -1 })).ok,
  ).toBe(false);
  expect(decodeClientEvent(JSON.stringify({ type: "rename", displayName: " " })).ok).toBe(false);
  expect(decodeClientEvent(JSON.stringify({ type: "focus", efficiency: 2 })).ok).toBe(false);
});

test("the roster is one entry per person, in arrival order", () => {
  const ada = newSocketData({ roomId: "r1", userId: "u1", displayName: "Ada" });
  const bob = newSocketData({ roomId: "r1", userId: "u2", displayName: "Bob" });
  ada.efficiency = 0.7;
  ada.focusedSeconds = 42;
  expect(toPresence([ada, bob])).toEqual([
    { userId: "u1", displayName: "Ada", efficiency: 0.7, focusedSeconds: 42 },
    { userId: "u2", displayName: "Bob", efficiency: 0, focusedSeconds: 0 },
  ]);
});

test("a second tab is the same rider, reporting the newer score", () => {
  const first = newSocketData({ roomId: "r1", userId: "u1", displayName: "Ada" });
  const second = newSocketData({ roomId: "r1", userId: "u1", displayName: "Ada" });
  first.efficiency = 0.2;
  second.efficiency = 0.9;
  expect(toPresence([first, second])).toEqual([
    { userId: "u1", displayName: "Ada", efficiency: 0.9, focusedSeconds: 0 },
  ]);
});
