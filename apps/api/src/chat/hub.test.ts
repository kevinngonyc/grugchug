import { expect, test } from "bun:test";
import type { Journey } from "@grugchug/shared";
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

test("the roster is one entry per open socket, in arrival order", () => {
  const ada = newSocketData({ roomId: "r1", userId: "u1", displayName: "Ada" });
  const bob = newSocketData({ roomId: "r1", userId: "u2", displayName: "Bob" });
  ada.efficiency = 0.7;
  ada.focusedSeconds = 42;
  expect(toPresence([ada, bob])).toEqual([
    {
      connectionId: ada.connectionId,
      userId: "u1",
      displayName: "Ada",
      efficiency: 0.7,
      focusedSeconds: 42,
    },
    {
      connectionId: bob.connectionId,
      userId: "u2",
      displayName: "Bob",
      efficiency: 0,
      focusedSeconds: 0,
    },
  ]);
});

test("two tabs of one browser are two riders, not one", () => {
  // They share a stored userId, so folding the roster by userId would leave
  // one entry — and each tab would see a room containing only itself.
  const first = newSocketData({ roomId: "r1", userId: "u1", displayName: "Ada" });
  const second = newSocketData({ roomId: "r1", userId: "u1", displayName: "Ada" });
  first.efficiency = 0.2;
  second.efficiency = 0.9;
  expect(first.connectionId).not.toBe(second.connectionId);
  const presence = toPresence([first, second]);
  expect(presence).toHaveLength(2);
  expect(presence.map((p) => p.efficiency)).toEqual([0.2, 0.9]);
});

test("decodes a journey report", () => {
  const journey: Journey = { state: "studying", station: { index: 2, total: 6 } };
  expect(decodeClientEvent(JSON.stringify({ type: "journey", avatar: "cat", journey }))).toEqual({
    ok: true,
    event: { type: "journey", avatar: "cat", journey },
  });
  expect(decodeClientEvent(JSON.stringify({ type: "journey", avatar: "nope", journey })).ok).toBe(
    false,
  );
});

test("the roster carries a rider's avatar and journey once sent, and omits them until then", () => {
  const journey: Journey = { state: "at-station", station: { index: 1, total: 3 } };
  const ada = newSocketData({ roomId: "r1", userId: "u1", displayName: "Ada" });
  const bob = newSocketData({ roomId: "r1", userId: "u2", displayName: "Bob" });
  ada.avatar = "cat";
  ada.journey = journey;

  const [adaPresence, bobPresence] = toPresence([ada, bob]);
  expect(adaPresence).toEqual({
    connectionId: ada.connectionId,
    userId: "u1",
    displayName: "Ada",
    efficiency: 0,
    avatar: "cat",
    focusedSeconds: 0,
    journey,
  });
  expect(bobPresence && "avatar" in bobPresence).toBe(false);
  expect(bobPresence && "journey" in bobPresence).toBe(false);
});
