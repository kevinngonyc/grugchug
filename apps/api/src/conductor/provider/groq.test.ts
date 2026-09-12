// Offline: fetch is stubbed, and the PDF is a real one built locally by
// buildMinimalPdfBase64 — no network, no external fixture file.
import { afterEach, describe, expect, test } from "bun:test";
import { buildMinimalPdfBase64 } from "../test-fixtures/minimal-pdf";
import { GroqProvider } from "./groq";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(content: string): { calls: Array<{ url: string; body: unknown }> } {
  const calls: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  }) as typeof fetch;
  return { calls };
}

describe("GroqProvider", () => {
  test("sends plain text parts as the chat message content", async () => {
    const { calls } = stubFetch('{"ok": true}');
    const provider = new GroqProvider("openai/gpt-oss-20b", "fake-key");

    const result = await provider.generate([{ kind: "text", text: "summarize this" }]);

    expect(result).toEqual({ text: '{"ok": true}', provider: "groq", model: "openai/gpt-oss-20b" });
    expect(calls[0]?.body).toMatchObject({
      model: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: "summarize this" }],
      response_format: { type: "json_object" },
    });
  });

  test("extracts a document part's PDF text and includes it in the message content", async () => {
    const { calls } = stubFetch('{"ok": true}');
    const provider = new GroqProvider("openai/gpt-oss-20b", "fake-key");
    const base64 = buildMinimalPdfBase64("Photosynthesis Notes");

    await provider.generate([
      { kind: "text", text: "Summarize the material." },
      { kind: "document", mimeType: "application/pdf", base64 },
    ]);

    const body = calls[0]?.body as { messages: Array<{ content: string }> } | undefined;
    const content = body?.messages[0]?.content;
    expect(content).toContain("Summarize the material.");
    expect(content).toContain("Photosynthesis Notes");
  });

  test("throws with the response body when the request fails", async () => {
    globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response("bad request", { status: 400 })) as typeof fetch;
    const provider = new GroqProvider("openai/gpt-oss-20b", "fake-key");

    await expect(provider.generate([{ kind: "text", text: "hi" }])).rejects.toThrow(/400/);
  });
});
