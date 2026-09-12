import { describe, expect, test } from "bun:test";
import { trainStateSchema, worldSnapshotSchema } from "./train";

const train = {
  id: "t1",
  owner: { name: "Ada", spriteUrl: "/characters/default.svg" },
  phase: "running" as const,
  efficiency: 0.7,
  lane: 0,
};

describe("trainStateSchema", () => {
  test("accepts a running train", () => {
    expect(trainStateSchema.parse(train)).toEqual(train);
  });

  test("rejects efficiency above 1", () => {
    expect(trainStateSchema.safeParse({ ...train, efficiency: 1.5 }).success).toBe(false);
  });

  test("rejects an unknown phase", () => {
    expect(trainStateSchema.safeParse({ ...train, phase: "flying" }).success).toBe(false);
  });

  test("accepts a train with speech and a clip", () => {
    const speaking = {
      ...train,
      speech: { id: "s1", text: "All aboard!", audioUrl: "/voices/s1.mp3" },
    };
    expect(trainStateSchema.parse(speaking)).toEqual(speaking);
  });

  test("accepts speech without a clip", () => {
    const speaking = { ...train, speech: { id: "s1", text: "All aboard!" } };
    expect(trainStateSchema.parse(speaking)).toEqual(speaking);
  });

  test("rejects empty speech text", () => {
    const result = trainStateSchema.safeParse({ ...train, speech: { id: "s1", text: "" } });
    expect(result.success).toBe(false);
  });
});

describe("worldSnapshotSchema", () => {
  test("accepts a snapshot keyed by train id", () => {
    const snapshot = { trains: { t1: train }, localTrainId: "t1" };
    expect(worldSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });
});
