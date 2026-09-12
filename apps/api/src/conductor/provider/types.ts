// The shape the harness and tools speak to. Neither ever imports a vendor
// SDK or calls fetch directly — only an LLMProvider instance from
// `./index`'s getProvider() factory.

// One piece of model input. "document" is base64 file bytes (a PDF); only
// Gemini reads these natively, Groq's text models cannot.
export type ProviderPart =
  | { kind: "text"; text: string }
  | { kind: "document"; mimeType: string; base64: string };

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
  generate(parts: ProviderPart[]): Promise<ProviderResult>;
}
