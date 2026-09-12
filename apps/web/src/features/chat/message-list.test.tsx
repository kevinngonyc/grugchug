import { expect, test } from "bun:test";
import type { ChatMessage } from "@grugchug/shared";
import { render, screen } from "@testing-library/react";
import { MessageList } from "./message-list";
import { emptyChatLog } from "./message-log";

function message(id: string, userId: string, body: string): ChatMessage {
  return {
    id,
    roomId: "r1",
    userId,
    displayName: userId === "me" ? "Kevin" : "Ada",
    body,
    createdAt: "2026-09-12T12:30:00.000Z",
  };
}

test("invites the user to start when the room is empty", () => {
  render(<MessageList log={emptyChatLog} currentUserId="me" />);
  expect(screen.getByText(/Nothing here yet/)).toBeTruthy();
});

test("labels other people by name and the current user as You", () => {
  render(
    <MessageList
      log={{ messages: [message("m1", "them", "hey"), message("m2", "me", "hi")], pending: [] }}
      currentUserId="me"
    />,
  );
  expect(screen.getByText("hey")).toBeTruthy();
  expect(screen.getByText("hi")).toBeTruthy();
  expect(screen.getByText(/Ada ·/)).toBeTruthy();
  expect(screen.getByText(/You ·/)).toBeTruthy();
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
          { clientId: "c2", body: "lost", createdAt: "2026-09-12T12:31:00.000Z", failed: true },
        ],
      }}
      currentUserId="me"
    />,
  );
  expect(screen.getByText("Sending…")).toBeTruthy();
  expect(screen.getByText("Not sent")).toBeTruthy();
  expect(screen.getByText("lost")).toBeTruthy();
});
