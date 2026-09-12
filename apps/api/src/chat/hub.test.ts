import { expect, test } from "bun:test";
import { decodeClientEvent, encode, newSocketData, roomTopic } from "./hub";

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

test("each socket gets its own rate limiter", () => {
  const a = newSocketData({ roomId: "r1", userId: "u1", displayName: "Ada" });
  const b = newSocketData({ roomId: "r1", userId: "u2", displayName: "Bob" });
  expect(a.limiter).not.toBe(b.limiter);
  expect(a.displayName).toBe("Ada");
});
