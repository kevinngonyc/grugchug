// Groq provider. OpenAI-compatible chat completions over plain fetch — no
// SDK needed. Groq's text models cannot read documents directly, so a
// document part is converted to plain text with a local PDF parser first
// (see ../pdf.ts); Gemini needs none of that since it reads PDF bytes
// natively.
import { extractPdfText } from "../pdf";
import type { LLMProvider, ProviderPart, ProviderResult } from "./types";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

interface GroqChatCompletion {
  choices?: Array<{ message?: { content?: string } }>;
}

export class GroqProvider implements LLMProvider {
  readonly provider = "groq" as const;

  constructor(
    readonly model: string,
    private readonly apiKey: string,
  ) {}

  async generate(parts: ProviderPart[]): Promise<ProviderResult> {
    const textChunks = await Promise.all(
      parts.map((part) =>
        part.kind === "text"
          ? part.text
          : extractPdfText(part.base64).then((text) => `Document text:\n${text}`),
      ),
    );
    const content = textChunks.join("\n\n");

    const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content }],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      throw new Error(`groq request failed: ${res.status} ${await res.text()}`);
    }

    const body = (await res.json()) as GroqChatCompletion;
    const text = body.choices?.[0]?.message?.content;
    if (!text) throw new Error("groq response had no message content");
    return { text, provider: this.provider, model: this.model };
  }
}
