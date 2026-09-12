import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AvatarDialog } from "./avatar-dialog";
import { useAvatarPickerUi } from "./avatar-picker-ui";
import { useProfile } from "./store";

const originalSetAvatar = useProfile.getState().setAvatar;
const user = {
  id: "u1",
  name: "Ada",
  avatar: "poku" as const,
  createdAt: "2026-09-12T00:00:00.000Z",
};

beforeEach(() => {
  useProfile.setState({ user, status: "ready" });
  useAvatarPickerUi.setState({ open: true });
});
afterEach(() => {
  cleanup();
  useProfile.setState({ user: null, status: "idle", setAvatar: originalSetAvatar });
});

test("saves the chosen avatar, blocks duplicate picks, and closes after success", async () => {
  let finish = () => {};
  const saving = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const setAvatar = mock(async () => {
    await saving;
    useProfile.setState({ user: { ...user, avatar: "cat" }, status: "ready" });
  });
  useProfile.setState({ setAvatar });
  render(<AvatarDialog />);
  expect(await screen.findByRole("dialog", { name: "Your character" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cat" }));
  expect(setAvatar).toHaveBeenCalledWith("cat");
  expect(screen.getByRole("status").textContent).toBe("Saving…");
  fireEvent.click(screen.getByRole("button", { name: "Doug" }));
  expect(setAvatar).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  await waitFor(() => expect(useAvatarPickerUi.getState().open).toBe(false));
  expect(useProfile.getState().user?.avatar).toBe("cat");
});

test("a failed save keeps the previous pick and lets the rider retry", async () => {
  useProfile.setState({
    setAvatar: async () => {
      useProfile.setState({ status: "error" });
    },
  });
  render(<AvatarDialog />);
  fireEvent.click(await screen.findByRole("button", { name: "Cat" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("alert").textContent).toContain("Couldn't save");
  expect(useAvatarPickerUi.getState().open).toBe(true);
  expect(screen.getByRole("button", { name: "Poku" }).getAttribute("aria-pressed")).toBe("true");
  useProfile.setState({
    setAvatar: async () => {
      useProfile.setState({ user: { ...user, avatar: "doug" }, status: "ready" });
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Doug" }));
  await waitFor(() => expect(useAvatarPickerUi.getState().open).toBe(false));
});

test("closing the picker makes no profile changes", async () => {
  const setAvatar = mock(async () => {});
  useProfile.setState({ setAvatar });
  render(<AvatarDialog />);
  fireEvent.click(await screen.findByRole("button", { name: "Close" }));
  expect(useAvatarPickerUi.getState().open).toBe(false);
  expect(setAvatar).not.toHaveBeenCalled();
});
