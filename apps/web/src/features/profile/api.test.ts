import { describe, expect, test } from "bun:test";
import { fetchUser, PROFILE_FETCH_TIMEOUT_MS, saveUser } from "./api";

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
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
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
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
    expect(calls[0]?.init?.method).toBe("PUT");
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ name: "You", avatar: "poku" }));
  });
});

// A stalled request must actually reject so profile.load can enter its error
// state and the session can board with the default avatar.
test.each(["GET", "PUT"] as const)(
  "%s aborts a hanging profile request",
  async (method) => {
    let signal: AbortSignal | null | undefined;
    const fetchFn = ((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal?.reason), { once: true });
      });
    }) as typeof fetch;
    const request =
      method === "GET"
        ? fetchUser("u1", fetchFn)
        : saveUser("u1", { name: "You", avatar: "poku" }, fetchFn);
    await expect(request).rejects.toThrow();
    expect(signal?.aborted).toBe(true);
  },
  PROFILE_FETCH_TIMEOUT_MS + 2000,
);
