import { describe, expect, test } from "bun:test";
import {
  RECYCLE_SPAN,
  TRACK_SEGMENT_LENGTH,
  TRACK_SEGMENTS,
  VISIBLE_HALF_WIDTH,
} from "./constants";
import { wrapWorldX } from "./motion";

describe("wrapWorldX", () => {
  test("leaves an on-screen item alone", () => {
    expect(wrapWorldX(3, 0, -VISIBLE_HALF_WIDTH, RECYCLE_SPAN)).toBe(3);
  });

  test("jumps an off-screen item forward by whole spans", () => {
    expect(wrapWorldX(-30, 0, -VISIBLE_HALF_WIDTH, RECYCLE_SPAN)).toBe(-30 + RECYCLE_SPAN);
    expect(wrapWorldX(-30, 60, -VISIBLE_HALF_WIDTH, RECYCLE_SPAN)).toBe(-30 + 2 * RECYCLE_SPAN);
  });

  test("a track run keeps covering the visible width at any scroll", () => {
    const run = TRACK_SEGMENTS * TRACK_SEGMENT_LENGTH;
    const start = -Math.floor(TRACK_SEGMENTS / 2) * TRACK_SEGMENT_LENGTH;
    const cutoff = -VISIBLE_HALF_WIDTH - TRACK_SEGMENT_LENGTH;
    let worldX = Array.from({ length: TRACK_SEGMENTS }, (_, i) => start + i * TRACK_SEGMENT_LENGTH);
    for (let scroll = 0; scroll <= 500; scroll += 0.37) {
      worldX = worldX.map((w) => wrapWorldX(w, scroll, cutoff, run));
      const screen = worldX.map((w) => w - scroll).sort((a, b) => a - b);
      expect(screen[0]).toBeLessThanOrEqual(-VISIBLE_HALF_WIDTH);
      expect((screen.at(-1) ?? 0) + TRACK_SEGMENT_LENGTH).toBeGreaterThanOrEqual(
        VISIBLE_HALF_WIDTH,
      );
      for (let i = 1; i < screen.length; i++) {
        expect((screen[i] ?? 0) - (screen[i - 1] ?? 0)).toBeCloseTo(TRACK_SEGMENT_LENGTH);
      }
    }
  });

  test("a pool spanning RECYCLE_SPAN never leaves a hole wider than its spacing", () => {
    const n = 16;
    const spacing = RECYCLE_SPAN / n;
    let worldX = Array.from({ length: n }, (_, i) => -VISIBLE_HALF_WIDTH + i * spacing);
    for (let scroll = 0; scroll <= 300; scroll += 0.53) {
      worldX = worldX.map((w) => wrapWorldX(w, scroll, -VISIBLE_HALF_WIDTH, RECYCLE_SPAN));
      const screen = worldX.map((w) => w - scroll).sort((a, b) => a - b);
      for (let i = 1; i < screen.length; i++) {
        expect((screen[i] ?? 0) - (screen[i - 1] ?? 0)).toBeCloseTo(spacing);
      }
    }
  });
});
