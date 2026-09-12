// Builds a minimal, valid single-page PDF with correct xref offsets, as
// base64. Used only by tests that need a real PDF to parse (see pdf.test.ts
// and provider/groq.test.ts) — no external fixture file, no network.
export function buildMinimalPdfBase64(text: string): string {
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  // Wide enough that pdf.js's text extraction, which clips to the page's
  // MediaBox, never truncates the test string.
  objects[3] =
    "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 2000 200] /Contents 5 0 R >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  const stream = `BT /F1 24 Tf 20 100 Td (${text}) Tj ET`;
  objects[5] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 1; i <= 5; i++) {
    offsets[i] = Buffer.byteLength(pdf, "latin1");
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, "latin1");
  pdf += "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "latin1").toString("base64");
}
