import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { useConductorUi } from "./store";

let button: HTMLButtonElement;

beforeEach(() => {
  useConductorUi.setState({ open: false });
  button = document.createElement("button");
  document.body.appendChild(button);
});

afterEach(() => {
  button.remove();
});

describe("useConductorUi", () => {
  test("closePanel blurs whatever is focused, so the region can go aria-hidden", () => {
    useConductorUi.getState().openPanel();
    button.focus();
    expect(document.activeElement).toBe(button);

    useConductorUi.getState().closePanel();

    expect(useConductorUi.getState().open).toBe(false);
    expect(document.activeElement).not.toBe(button);
  });

  test("toggle blurs only when it is actually closing", () => {
    button.focus();

    useConductorUi.getState().toggle(); // opens: nothing to blur for
    expect(document.activeElement).toBe(button);

    useConductorUi.getState().toggle(); // closes: blurs
    expect(document.activeElement).not.toBe(button);
  });
});
