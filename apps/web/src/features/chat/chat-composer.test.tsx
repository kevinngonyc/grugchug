import { expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatComposer } from "./chat-composer";

test("Enter sends the message and clears the box", () => {
  const sent: string[] = [];
  render(<ChatComposer onSend={(body) => sent.push(body)} />);

  const box = screen.getByLabelText("Message") as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: "  hello  " } });
  fireEvent.keyDown(box, { key: "Enter" });

  expect(sent).toEqual(["hello"]);
  expect(box.value).toBe("");
});

test("Shift+Enter does not send", () => {
  const sent: string[] = [];
  render(<ChatComposer onSend={(body) => sent.push(body)} />);

  const box = screen.getByLabelText("Message");
  fireEvent.change(box, { target: { value: "line one" } });
  fireEvent.keyDown(box, { key: "Enter", shiftKey: true });

  expect(sent).toEqual([]);
});

test("whitespace alone is not sendable", () => {
  const sent: string[] = [];
  render(<ChatComposer onSend={(body) => sent.push(body)} />);

  const box = screen.getByLabelText("Message");
  fireEvent.change(box, { target: { value: "   " } });
  fireEvent.keyDown(box, { key: "Enter" });

  expect(sent).toEqual([]);
  expect(screen.getByRole("button", { name: "Send" }).hasAttribute("disabled")).toBe(true);
});
