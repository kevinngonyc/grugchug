import { beforeEach, describe, expect, test } from "bun:test";
import { getUserId, USER_ID_KEY } from "./user-id";

beforeEach(() => {
  localStorage.clear();
});

describe("getUserId", () => {
  test("mints an id on first use and stores it", () => {
    const id = getUserId();
    expect(id.length).toBeGreaterThan(0);
    expect(localStorage.getItem(USER_ID_KEY)).toBe(id);
  });

  test("returns the same id on later calls", () => {
    expect(getUserId()).toBe(getUserId());
  });

  test("respects an id that is already stored", () => {
    localStorage.setItem(USER_ID_KEY, "existing");
    expect(getUserId()).toBe("existing");
  });
});
