import { describe, expect, test } from "bun:test";
import {
  chatMessageSchema,
  clientChatEventSchema,
  displayNameSchema,
  inviteCodeSchema,
  joinRoomRequestSchema,
  MESSAGE_MAX_LENGTH,
  messageBodySchema,
  serverChatEventSchema,
} from "./chat";

describe("inviteCodeSchema", () => {
  test("accepts and upper-cases a code typed in lower case", () => {
    expect(inviteCodeSchema.parse(" k4m7hq2z ")).toBe("K4M7HQ2Z");
  });

  test("rejects the ambiguous glyphs left out of the alphabet", () => {
    for (const code of ["K4M7HQ2O", "K4M7HQ2I", "K4M7HQ21", "K4M7HQ2L"]) {
      expect(inviteCodeSchema.safeParse(code).success).toBe(false);
    }
  });

  test("rejects the wrong length", () => {
    expect(inviteCodeSchema.safeParse("K4M7HQ2").success).toBe(false);
    expect(inviteCodeSchema.safeParse("K4M7HQ2ZZ").success).toBe(false);
  });
});

describe("message and name bodies", () => {
  test("trims before measuring, so whitespace is not a message", () => {
    expect(messageBodySchema.safeParse("   \n  ").success).toBe(false);
    expect(messageBodySchema.parse("  hey  ")).toBe("hey");
    expect(displayNameSchema.parse("  Kevin ")).toBe("Kevin");
  });

  test("caps message length", () => {
    expect(messageBodySchema.safeParse("a".repeat(MESSAGE_MAX_LENGTH)).success).toBe(true);
    expect(messageBodySchema.safeParse("a".repeat(MESSAGE_MAX_LENGTH + 1)).success).toBe(false);
  });
});

describe("wire protocol", () => {
  test("a send event round-trips", () => {
    const parsed = clientChatEventSchema.parse({ type: "send", clientId: "c1", body: "hi" });
    expect(parsed).toEqual({ type: "send", clientId: "c1", body: "hi" });
  });

  test("an unknown client event type is rejected", () => {
    expect(clientChatEventSchema.safeParse({ type: "typing", clientId: "c1" }).success).toBe(false);
  });

  test("a server message event carries a full message and a nullable clientId", () => {
    const message = {
      id: "m1",
      roomId: "r1",
      userId: "u1",
      displayName: "Kevin",
      body: "hi",
      createdAt: "2026-09-12T00:00:00.000Z",
    };
    expect(chatMessageSchema.safeParse(message).success).toBe(true);
    expect(
      serverChatEventSchema.safeParse({ type: "message", message, clientId: null }).success,
    ).toBe(true);
  });

  test("join requests normalize the invite code", () => {
    const parsed = joinRoomRequestSchema.parse({ inviteCode: "k4m7hq2z", displayName: " Ada " });
    expect(parsed.inviteCode).toBe("K4M7HQ2Z");
    expect(parsed.displayName).toBe("Ada");
  });
});
