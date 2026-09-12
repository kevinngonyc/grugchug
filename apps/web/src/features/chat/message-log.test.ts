import { describe, expect, test } from "bun:test";
import type { ChatMessage } from "@grugchug/shared";
import { chatLogReducer, emptyChatLog, mergeMessages } from "./message-log";

function message(id: string, createdAt: string, body = id): ChatMessage {
  return { id, roomId: "r1", userId: "u1", displayName: "Ada", body, createdAt };
}

const a = message("a", "2026-09-12T00:00:01.000Z");
const b = message("b", "2026-09-12T00:00:02.000Z");
const c = message("c", "2026-09-12T00:00:03.000Z");

describe("mergeMessages", () => {
  test("sorts by server time regardless of arrival order", () => {
    expect(mergeMessages([c, a], [b]).map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  test("is idempotent, so replayed history does not duplicate", () => {
    const once = mergeMessages([], [a, b]);
    expect(mergeMessages(once, [a, b]).map((m) => m.id)).toEqual(["a", "b"]);
  });

  test("breaks same-millisecond ties by id, stably", () => {
    const t = "2026-09-12T00:00:05.000Z";
    const ids = mergeMessages([], [message("z", t), message("k", t)]).map((m) => m.id);
    expect(ids).toEqual(["k", "z"]);
  });

  test("a later copy of the same id replaces the earlier one", () => {
    const edited = message("a", a.createdAt, "edited");
    expect(mergeMessages([a], [edited])[0]?.body).toBe("edited");
  });
});

describe("chatLogReducer", () => {
  test("an optimistic message is replaced by the stored one, not shown twice", () => {
    const queued = chatLogReducer(emptyChatLog, {
      type: "queued",
      pending: { clientId: "c1", body: "hi", createdAt: a.createdAt, failed: false },
    });
    expect(queued.pending).toHaveLength(1);

    const confirmed = chatLogReducer(queued, { type: "received", message: a, clientId: "c1" });
    expect(confirmed.pending).toEqual([]);
    expect(confirmed.messages.map((m) => m.id)).toEqual(["a"]);
  });

  test("someone else's message leaves our pending queue alone", () => {
    const queued = chatLogReducer(emptyChatLog, {
      type: "queued",
      pending: { clientId: "c1", body: "hi", createdAt: a.createdAt, failed: false },
    });
    const other = chatLogReducer(queued, { type: "received", message: b, clientId: null });
    expect(other.pending).toHaveLength(1);
    expect(other.messages.map((m) => m.id)).toEqual(["b"]);
  });

  test("a failed send is marked rather than dropped", () => {
    const queued = chatLogReducer(emptyChatLog, {
      type: "queued",
      pending: { clientId: "c1", body: "hi", createdAt: a.createdAt, failed: false },
    });
    const failed = chatLogReducer(queued, { type: "failed", clientId: "c1" });
    expect(failed.pending[0]?.failed).toBe(true);
    expect(failed.pending[0]?.body).toBe("hi");
  });

  test("history merges into what is already on screen", () => {
    const withLive = chatLogReducer(emptyChatLog, { type: "received", message: c, clientId: null });
    const withHistory = chatLogReducer(withLive, { type: "history", messages: [a, b, c] });
    expect(withHistory.messages.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  test("reset clears everything", () => {
    const withLive = chatLogReducer(emptyChatLog, { type: "received", message: c, clientId: null });
    expect(chatLogReducer(withLive, { type: "reset" })).toEqual(emptyChatLog);
  });
});
