// Gemini provider. PDFs go in as inlineData bytes — Gemini has native PDF
// vision and reads the text, figures and tables itself, so no PDF parsing
// library is installed here.
import { GoogleGenAI } from "@google/genai";
import type { GenerateOptions, LLMProvider, ProviderPart, ProviderResult } from "./types";

export class GeminiProvider implements LLMProvider {
  readonly provider = "gemini" as const;
  private readonly client: GoogleGenAI;

  readonly model: string;

  constructor(model: string, apiKey: string) {
    this.model = model;
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(parts: ProviderPart[], options: GenerateOptions = {}): Promise<ProviderResult> {
    const contentParts = parts.map((part) =>
      part.kind === "text"
        ? { text: part.text }
        : { inlineData: { mimeType: part.mimeType, data: part.base64 } },
    );
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [{ role: "user", parts: contentParts }],
      config: {
        responseMimeType: "application/json",
        ...(options.system ? { systemInstruction: options.system } : {}),
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      },
    });
    return { text: response.text ?? "", provider: this.provider, model: this.model };
  }
}
