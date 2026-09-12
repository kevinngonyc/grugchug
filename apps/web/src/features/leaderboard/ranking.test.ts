import { describe, expect, test } from "bun:test";
import type { TrainState } from "@grugchug/shared";
import { formatFocusTime, rankTrains } from "./ranking";

function train(id: string, name: string, focusedSeconds?: number): TrainState {
  return {
    id,
    owner: { name, spriteUrl: "/characters/poku.png" },
    phase: "running",
    efficiency: 0.5,
    focusedSeconds,
    lane: 0,
  };
}

describe("rankTrains", () => {
  test("most focused time first", () => {
    const ranked = rankTrains([train("a", "Ada", 30), train("b", "Bo", 90), train("c", "Cy", 60)]);
    expect(ranked.map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  test("a rider with no total yet ranks as zero, and ties go by name", () => {
    const ranked = rankTrains([train("z", "Zed"), train("a", "Ada", 0), train("m", "Mo", 5)]);
    expect(ranked.map((t) => t.owner.name)).toEqual(["Mo", "Ada", "Zed"]);
  });

  test("leaves its input alone", () => {
    const input = [train("a", "Ada", 1), train("b", "Bo", 2)];
    rankTrains(input);
    expect(input.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("formatFocusTime", () => {
  test("minutes and seconds under an hour", () => {
    expect(formatFocusTime(0)).toBe("0:00");
    expect(formatFocusTime(65.9)).toBe("1:05");
  });

  test("hours once there is one", () => {
    expect(formatFocusTime(3725)).toBe("1:02:05");
  });
});
