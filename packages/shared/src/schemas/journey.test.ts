import { describe, expect, test } from "bun:test";
import { journeySchema, journeyStateSchema } from "./journey";

describe("journeySchema", () => {
  test("accepts a rider at a station", () => {
    const journey = { state: "at-station" as const, station: { index: 2, total: 6 } };
    expect(journeySchema.parse(journey)).toEqual(journey);
  });

  test("accepts an idle rider with no station", () => {
    expect(journeySchema.parse({ state: "idle", station: null })).toEqual({
      state: "idle",
      station: null,
    });
  });

  test("rejects a station index of zero", () => {
    expect(
      journeySchema.safeParse({ state: "studying", station: { index: 0, total: 6 } }).success,
    ).toBe(false);
  });

  test("lists every state the loop can be in", () => {
    expect(["answering", "at-station", "finished", "idle", "on-break", "studying"].sort()).toEqual(
      [...journeyStateSchema.options].sort(),
    );
  });
});
