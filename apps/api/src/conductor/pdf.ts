// PDF text extraction for providers that cannot read documents natively.
// Gemini never calls this — it reads PDF bytes directly via inlineData.
// This exists only for the Groq fallback path, where the material has to
// arrive as plain text.
import { extractText, getDocumentProxy } from "unpdf";

export async function extractPdfText(base64: string): Promise<string> {
  const bytes = Buffer.from(base64, "base64");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}
