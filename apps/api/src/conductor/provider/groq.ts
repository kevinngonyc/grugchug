// Groq provider. OpenAI-compatible chat completions over plain fetch — no
// SDK needed. Groq's text models cannot read documents, so a document part
// fails the call fast instead of silently dropping the material.
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
    const textParts = parts.filter((part) => part.kind === "text");
    if (textParts.length !== parts.length) {
      throw new Error(
        `groq provider (${this.model}) cannot read document input; only gemini reads PDFs natively`,
      );
    }
    const content = textParts.map((part) => part.text).join("\n\n");

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
