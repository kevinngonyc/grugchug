import { expect, test } from "bun:test";
import type { ChatMessage } from "@grugchug/shared";
import { render, screen } from "@testing-library/react";
import { MessageList } from "./message-list";
import { emptyChatLog } from "./message-log";

function message(id: string, userId: string, body: string, createdAt?: string): ChatMessage {
  return {
    id,
    roomId: "r1",
    userId,
    displayName: userId === "me" ? "Kevin" : "Ada",
    body,
    createdAt: createdAt ?? "2026-09-12T12:30:00.000Z",
  };
}

test("invites the user to start when the room is empty", () => {
  render(<MessageList log={emptyChatLog} currentUserId="me" />);
  expect(screen.getByText(/Nothing here yet/)).toBeTruthy();
});

test("names the other person once per run of messages, and never names you", () => {
  render(
    <MessageList
      log={{
        messages: [
          message("m1", "them", "hey"),
          message("m2", "them", "you there?"),
          message("m3", "me", "hi"),
        ],
        pending: [],
      }}
      currentUserId="me"
    />,
  );

  expect(screen.getByText("hey")).toBeTruthy();
  expect(screen.getByText("you there?")).toBeTruthy();
  expect(screen.getAllByText("Ada")).toHaveLength(1);
  expect(screen.queryByText("Kevin")).toBeNull();
});

test("a long pause starts a new stack from the same person", () => {
  render(
    <MessageList
      log={{
        messages: [
          message("m1", "them", "morning", "2026-09-12T12:00:00.000Z"),
          message("m2", "them", "still here?", "2026-09-12T13:00:00.000Z"),
        ],
        pending: [],
      }}
      currentUserId="me"
    />,
  );

  expect(screen.getAllByText("Ada")).toHaveLength(2);
});

test("shows an unsent message as pending, and a failed one as not sent", () => {
  render(
    <MessageList
      log={{
        messages: [],
        pending: [
          {
            clientId: "c1",
            body: "in flight",
            createdAt: "2026-09-12T12:31:00.000Z",
            failed: false,
          },
          { clientId: "c2", body: "lost", createdAt: "2026-09-12T12:40:00.000Z", failed: true },
        ],
      }}
      currentUserId="me"
    />,
  );
  expect(screen.getByText("Sending…")).toBeTruthy();
  expect(screen.getByText("Not sent")).toBeTruthy();
  expect(screen.getByText("lost")).toBeTruthy();
});
