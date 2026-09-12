// PDF text extraction for providers that cannot read documents natively.
// Gemini never calls this — it reads PDF bytes directly via inlineData.
// This exists only for the Groq fallback path, where the material has to
// arrive as plain text.
import { extractText, getDocumentProxy } from "unpdf";

// The same PDF is attached to every station's quiz and every question to the
// TA, so its text is kept by content hash instead of re-parsed each time.
// Bounded, oldest out first.
const MAX_CACHED_PDFS = 16;
const extracted = new Map<string, string>();

export async function extractPdfText(base64: string): Promise<string> {
  const key = new Bun.CryptoHasher("sha256").update(base64).digest("hex");
  const cached = extracted.get(key);
  if (cached !== undefined) return cached;

  const bytes = Buffer.from(base64, "base64");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });

  extracted.set(key, text);
  if (extracted.size > MAX_CACHED_PDFS) {
    const oldest = extracted.keys().next().value;
    if (oldest !== undefined) extracted.delete(oldest);
  }
  return text;
}
