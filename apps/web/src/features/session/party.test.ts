import { describe, expect, test } from "bun:test";
import type { ChatPresenceMember } from "@grugchug/shared";
import { arrivals, MAX_PARTY_TRAINS, partyTrainId, partyTrains, spriteForUserId } from "./party";

function member(userId: string, displayName = userId, efficiency = 0.5): ChatPresenceMember {
  return { userId, displayName, efficiency };
}

describe("partyTrains", () => {
  test("leaves you out: your own train is not a guest in your world", () => {
    const trains = partyTrains([member("me"), member("ada")], "me");
    expect(trains).toHaveLength(1);
    expect(trains[0]?.id).toBe(partyTrainId("ada"));
  });

  test("lanes follow arrival order, starting beside the local train", () => {
    const trains = partyTrains([member("ada"), member("bo"), member("cy")], "me");
    expect(trains.map((t) => t.lane)).toEqual([1, 2, 3]);
  });

  test("stops at the lanes that fit on screen", () => {
    const crowd = Array.from({ length: MAX_PARTY_TRAINS + 3 }, (_, i) => member(`u${i}`));
    expect(partyTrains(crowd, "me")).toHaveLength(MAX_PARTY_TRAINS);
  });

  test("carries the name and the reported focus onto the train", () => {
    const [train] = partyTrains([member("ada", "Ada", 0.9)], "me");
    expect(train?.owner.name).toBe("Ada");
    expect(train?.efficiency).toBe(0.9);
    expect(train?.phase).toBe("running");
  });

  test("a signed-out visitor sees everyone, since nobody is them", () => {
    expect(partyTrains([member("ada"), member("bo")], null)).toHaveLength(2);
  });
});

describe("spriteForUserId", () => {
  test("is stable, so you look the same on every screen", () => {
    expect(spriteForUserId("ada")).toBe(spriteForUserId("ada"));
  });

  test("always resolves to a sprite that exists", () => {
    for (const id of ["", "a", "ada", "x".repeat(64), "Rider 4821"]) {
      expect(spriteForUserId(id)).toMatch(/^\/characters\//);
    }
  });
});

describe("arrivals", () => {
  const known = (...ids: string[]) => new Set(ids);

  test("finds the people who were not here last time", () => {
    expect(arrivals([member("ada"), member("bo")], known("ada"), "me")).toEqual(["bo"]);
  });

  test("you turning up is not someone joining", () => {
    expect(arrivals([member("me"), member("ada")], known("ada"), "me")).toEqual([]);
  });

  test("a rename or a new score is not an arrival", () => {
    const before = [member("ada", "Ada", 0.2)];
    const after = [member("ada", "Ada the Swift", 0.9)];
    expect(arrivals(after, known(...before.map((m) => m.userId)), "me")).toEqual([]);
  });

  test("someone who left and came back has joined again", () => {
    expect(arrivals([member("bo")], known("ada"), "me")).toEqual(["bo"]);
  });

  test("an empty room announces nobody", () => {
    expect(arrivals([], known("ada"), "me")).toEqual([]);
  });
});
