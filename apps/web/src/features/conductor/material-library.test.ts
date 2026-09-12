import { beforeEach, describe, expect, test } from "bun:test";
import { useMaterialLibrary } from "./material-library";

const STORAGE_KEY = "grugchug.conductor.library";

function stored(): { items: { name: string }[]; planId: string | null } {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{"items":[],"planId":null}');
}

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  useMaterialLibrary.setState({ items: [], planId: null });
});

describe("useMaterialLibrary", () => {
  test("add keeps upload order and persists", () => {
    useMaterialLibrary.getState().add("one.pdf", { kind: "text", text: "a" });
    useMaterialLibrary.getState().add("two.pdf", { kind: "text", text: "b" });

    expect(useMaterialLibrary.getState().items.map((i) => i.name)).toEqual(["one.pdf", "two.pdf"]);
    expect(stored().items.map((i) => i.name)).toEqual(["one.pdf", "two.pdf"]);
  });

  test("remove drops the item from memory and storage", () => {
    const keep = useMaterialLibrary.getState().add("keep.pdf", { kind: "text", text: "a" });
    const drop = useMaterialLibrary.getState().add("drop.pdf", { kind: "text", text: "b" });

    useMaterialLibrary.getState().remove(drop.id);

    expect(useMaterialLibrary.getState().items).toEqual([keep]);
    expect(stored().items).toHaveLength(1);
  });

  test("the remembered route is dropped whenever the set changes", () => {
    const item = useMaterialLibrary.getState().add("one.pdf", { kind: "text", text: "a" });
    useMaterialLibrary.getState().setPlanId("plan-1");
    expect(useMaterialLibrary.getState().planId).toBe("plan-1");
    expect(stored().planId).toBe("plan-1");

    useMaterialLibrary.getState().add("two.pdf", { kind: "text", text: "b" });
    expect(useMaterialLibrary.getState().planId).toBeNull();

    useMaterialLibrary.getState().setPlanId("plan-2");
    useMaterialLibrary.getState().remove(item.id);
    expect(useMaterialLibrary.getState().planId).toBeNull();
    expect(stored().planId).toBeNull();
  });
});
