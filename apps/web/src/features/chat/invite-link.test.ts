import { afterEach, expect, test } from "bun:test";
import { inviteLink } from "./api";

const originalFetch = globalThis.fetch;
const originDescriptor = Object.getOwnPropertyDescriptor(window.location, "origin");
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originDescriptor) Object.defineProperty(window.location, "origin", originDescriptor);
  else Reflect.deleteProperty(window.location, "origin");
});

test("uses the API server's hostname and preserves the frontend origin's port", async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    expect(input).toBe("/api/chat/invite-host");
    return Response.json({ hostname: "192.168.1.20" });
  }) as unknown as typeof fetch;
  Object.defineProperty(window.location, "origin", {
    configurable: true,
    value: "http://localhost:5173",
  });
  const result = new URL(await inviteLink("abc123"));
  expect(result.hostname).toBe("192.168.1.20");
  expect(result.port).toBe("5173");
  expect(result.protocol).toBe("http:");
  expect(result.pathname).toBe("/chat/join/abc123");
});

test("fails visibly rather than falling back to a localhost invite", async () => {
  globalThis.fetch = (async () =>
    Response.json({ error: "invite_unavailable" }, { status: 503 })) as unknown as typeof fetch;
  await expect(inviteLink("abc123")).rejects.toThrow("invite_unavailable");
});
