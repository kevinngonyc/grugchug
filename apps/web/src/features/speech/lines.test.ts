import { describe, expect, test } from "bun:test";
import { VOICE_LINES } from "./lines";

describe("VOICE_LINES", () => {
  test("start of session plays the start_session clip", () => {
    expect(VOICE_LINES.startSession.audioUrl).toBe("/audio/start_session1.mp3");
    expect(VOICE_LINES.startSession.text.length).toBeGreaterThan(0);
  });

  test("every line has a caption and a clip under /audio/", () => {
    for (const line of Object.values(VOICE_LINES)) {
      expect(line.text.length).toBeGreaterThan(0);
      expect(line.audioUrl.startsWith("/audio/")).toBe(true);
      expect(line.audioUrl.endsWith(".mp3")).toBe(true);
    }
  });
});
