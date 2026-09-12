import { describe, expect, test } from "bun:test";
import { GroqProvider } from "./groq";

describe("GroqProvider", () => {
  test("rejects document parts before making any request", async () => {
    const provider = new GroqProvider("openai/gpt-oss-20b", "fake-key");
    await expect(
      provider.generate([{ kind: "document", mimeType: "application/pdf", base64: "AAAA" }]),
    ).rejects.toThrow(/cannot read document input/);
  });
});
