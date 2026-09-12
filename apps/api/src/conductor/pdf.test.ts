// Offline: parses a real, locally-built PDF. No network, no fixture file.
import { describe, expect, test } from "bun:test";
import { extractPdfText } from "./pdf";
import { buildMinimalPdfBase64 } from "./test-fixtures/minimal-pdf";

describe("extractPdfText", () => {
  test("extracts text from a real PDF's content stream", async () => {
    const base64 = buildMinimalPdfBase64("Hello Conductor");
    const text = await extractPdfText(base64);
    expect(text).toContain("Hello Conductor");
  });

  test("rejects bytes that are not a PDF", async () => {
    const base64 = Buffer.from("this is not a pdf").toString("base64");
    await expect(extractPdfText(base64)).rejects.toThrow();
  });
});
