import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { AvatarPicker } from "./avatar-picker";

test("renders one button per avatar and marks the selected one", () => {
  render(<AvatarPicker selected="poku" onSelect={() => {}} />);
  const buttons = screen.getAllByRole("button");
  expect(buttons).toHaveLength(7);
  expect(screen.getByRole("button", { name: "Poku" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "Conductor" }).getAttribute("aria-pressed")).toBe(
    "false",
  );
});

test.each(["Conductor", "Cat", "Doug", "Bbob", "Bilby"])("clicking %s reports its id", (name) => {
  const onSelect = mock((_id: string) => {});
  render(<AvatarPicker selected="poku" onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("button", { name }));
  expect(onSelect).toHaveBeenCalledWith(name.toLowerCase());
});

test("disabled blocks clicks", () => {
  const onSelect = mock((_id: string) => {});
  render(<AvatarPicker selected={undefined} onSelect={onSelect} disabled />);
  fireEvent.click(screen.getByRole("button", { name: "Bonbon" }));
  expect(onSelect).not.toHaveBeenCalled();
});
