import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { VOICE_LINES } from "./lines";

const AUDIO_DIR = join(import.meta.dir, "../../../public/audio");

describe("VOICE_LINES", () => {
  test("start of session plays the censored start_session clip", () => {
    expect(VOICE_LINES.startSession.audioUrl).toBe("/audio/start_sessioncensored.mp3");
    expect(VOICE_LINES.startSession.text.length).toBeGreaterThan(0);
  });

  test("breaks and restarts have their own censored clips", () => {
    expect(VOICE_LINES.takeBreak.audioUrl).toBe("/audio/take_breakcensored.mp3");
    expect(VOICE_LINES.restartStudy.audioUrl).toBe("/audio/restart_studycensored.mp3");
  });

  test("every registered clip is the censored take, and is committed", () => {
    for (const line of Object.values(VOICE_LINES)) {
      expect(line.audioUrl).toMatch(/censored\.mp3$/);
      expect(existsSync(join(AUDIO_DIR, line.audioUrl.replace("/audio/", "")))).toBe(true);
    }
  });

  test("registers exactly the five recorded lines", () => {
    expect(Object.keys(VOICE_LINES).sort()).toEqual(
      ["greatSession", "passQuiz", "restartStudy", "startSession", "takeBreak"].sort(),
    );
  });

  test("every line has a caption and a clip under /audio/", () => {
    for (const line of Object.values(VOICE_LINES)) {
      expect(line.text.length).toBeGreaterThan(0);
      expect(line.audioUrl.startsWith("/audio/")).toBe(true);
      expect(line.audioUrl.endsWith(".mp3")).toBe(true);
    }
  });
});
