import { describe, expect, test } from "bun:test";
import type { TrainState } from "@grugchug/shared";
import { assignColors, PLAYER_COLORS } from "./player-color";

function train(id: string, lane: number): TrainState {
  return {
    id,
    owner: { name: id, spriteUrl: "/characters/poku.png" },
    phase: "running",
    efficiency: 0.5,
    lane,
  };
}

describe("assignColors", () => {
  test("you are always the first colour", () => {
    const colors = assignColors([train("friend", 1), train("local", 0)], "local");
    expect(colors.get("local")).toBe(PLAYER_COLORS[0]);
  });

  test("everyone on screen gets a different colour", () => {
    const trains = [train("local", 0), train("a", 1), train("b", 2), train("c", 3), train("d", 4)];
    const colors = assignColors(trains, "local");
    expect(new Set(colors.values()).size).toBe(trains.length);
  });

  test("others take colours in lane order", () => {
    const colors = assignColors([train("far", 2), train("near", 1), train("local", 0)], "local");
    expect(colors.get("near")).toBe(PLAYER_COLORS[1]);
    expect(colors.get("far")).toBe(PLAYER_COLORS[2]);
  });

  test("a crowd past the palette never borrows yours", () => {
    const crowd = Array.from({ length: 9 }, (_, i) => train(`f${i}`, i + 1));
    const colors = assignColors([train("local", 0), ...crowd], "local");
    for (const friend of crowd) expect(colors.get(friend.id)).not.toBe(PLAYER_COLORS[0]);
  });
});
