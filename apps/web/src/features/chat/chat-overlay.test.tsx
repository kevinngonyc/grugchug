import { expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { clearActiveRoomId } from "./active-room";
import { ChatOverlay } from "./chat-overlay";
import { clearIdentity } from "./identity";

// No identity and no active room: the overlay shows the picker, and nothing
// here touches the network.
function renderClosed() {
  clearIdentity();
  clearActiveRoomId();
  return render(<ChatOverlay />);
}

test("starts closed, with only the toggle on screen", () => {
  renderClosed();
  expect(screen.getByLabelText("Show chat")).toBeTruthy();
  expect(screen.queryByLabelText("Hide chat")).toBeNull();
});

test("the toggle opens and closes the panel", () => {
  renderClosed();

  fireEvent.click(screen.getByLabelText("Show chat"));
  expect(screen.getByLabelText("Hide chat")).toBeTruthy();
  expect(screen.getByLabelText("Invite code")).toBeTruthy();

  fireEvent.click(screen.getByLabelText("Hide chat"));
  expect(screen.getByLabelText("Show chat")).toBeTruthy();
});
