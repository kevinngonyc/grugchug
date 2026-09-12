import { describe, expect, test } from "bun:test";
import { fetchUser, saveUser } from "./api";

const user = {
  id: "u1",
  name: "You",
  avatar: "poku" as const,
  createdAt: "2026-09-11T00:00:00.000Z",
};

type Call = { url: string; init: RequestInit | undefined };

function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, fetchFn };
}

describe("fetchUser", () => {
  test("returns the parsed user", async () => {
    const { calls, fetchFn } = fakeFetch(200, user);
    expect(await fetchUser("u1", fetchFn)).toEqual(user);
    expect(calls[0]?.url).toBe("/api/users/u1");
  });

  test("returns null on 404", async () => {
    const { fetchFn } = fakeFetch(404, { error: "not found" });
    expect(await fetchUser("u1", fetchFn)).toBeNull();
  });

  test("throws on other failures", async () => {
    const { fetchFn } = fakeFetch(500, {});
    await expect(fetchUser("u1", fetchFn)).rejects.toThrow();
  });
});

describe("saveUser", () => {
  test("PUTs the profile as JSON and returns the parsed user", async () => {
    const { calls, fetchFn } = fakeFetch(200, user);
    const result = await saveUser("u1", { name: "You", avatar: "poku" }, fetchFn);
    expect(result).toEqual(user);
    expect(calls[0]?.url).toBe("/api/users/u1");
    expect(calls[0]?.init?.method).toBe("PUT");
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ name: "You", avatar: "poku" }));
  });
});
