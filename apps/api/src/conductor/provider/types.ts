// The shape the harness and tools speak to. Neither ever imports a vendor
// SDK or calls fetch directly — only an LLMProvider instance from
// `./index`'s getProvider() factory.

// One piece of model input. "document" is base64 file bytes (a PDF).
// Gemini reads these natively; Groq's text models can't, so GroqProvider
// extracts the text locally first (see ../pdf.ts) before sending it.
export type ProviderPart =
  | { kind: "text"; text: string }
  | { kind: "document"; mimeType: string; base64: string };

// Per-call settings that are not part of the content. `system` is who the
// model is and the rules it keeps, sent as the vendor's system instruction so
// it stays apart from the data in the parts (material, a student's answer).
export interface GenerateOptions {
  system?: string;
  temperature?: number;
}

// What a provider call returns before the harness parses and validates it
// as JSON. provider and model are echoed back so trace logs know exactly
// which vendor and model served the call.
export interface ProviderResult {
  text: string;
  provider: "gemini" | "groq";
  model: string;
}

export interface LLMProvider {
  readonly provider: "gemini" | "groq";
  readonly model: string;
  generate(parts: ProviderPart[], options?: GenerateOptions): Promise<ProviderResult>;
}
