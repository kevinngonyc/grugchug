import { expect, test } from "bun:test";
import { userProfileSchema } from "@grugchug/shared";
import { request } from "./request";

const schema = userProfileSchema;
const respond = (status: number, body = "") =>
  (async () => new Response(body, { status })) as unknown as typeof fetch;

test.each([502, 503])(
  "HTTP %s with no explanation tells the learner the study server is unavailable",
  async (status) => {
    await expect(request("/conductor/plans", schema, {}, respond(status))).rejects.toThrow(
      "Start bun run dev from the project root",
    );
  },
);
test("a 503 that carries the API's own reason shows that reason, not the start-up hint", async () => {
  // The API answers 503 itself when the LLM is misconfigured; the server is
  // running, so telling the learner to start it would be wrong.
  await expect(
    request(
      "/conductor/plans",
      schema,
      {},
      respond(503, JSON.stringify({ error: "AI provider unavailable: GROQ_FLASH_MODEL is not set" })),
    ),
  ).rejects.toThrow("AI provider unavailable: GROQ_FLASH_MODEL is not set");
});
test("connection failures have a distinct recovery message", async () => {
  const failed = (async () => {
    throw new TypeError("Failed to fetch");
  }) as unknown as typeof fetch;
  await expect(request("/conductor/plans", schema, {}, failed)).rejects.toThrow(
    "Cannot reach the study server",
  );
});
test("server validation details survive the HTTP transport", async () => {
  await expect(
    request(
      "/conductor/plans",
      schema,
      {},
      respond(400, JSON.stringify({ error: "invalid body", detail: "material is too large" })),
    ),
  ).rejects.toThrow("invalid body: material is too large");
});
test("valid responses still parse", async () => {
  expect(
    await request("/health", schema, {}, respond(200, '{"name":"You","avatar":"poku"}')),
  ).toEqual({ name: "You", avatar: "poku" });
});
