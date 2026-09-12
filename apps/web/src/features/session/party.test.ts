import { describe, expect, test } from "bun:test";
import type { ChatPresenceMember, Journey } from "@grugchug/shared";
import { arrivals, MAX_PARTY_TRAINS, partyTrainId, partyTrains, spriteForUserId } from "./party";

// A rider is a connection. Tests give each one its own, and the two-tab case
// below is the whole reason the roster is keyed this way.
function member(userId: string, displayName = userId, efficiency = 0.5): ChatPresenceMember {
  return { connectionId: `conn-${userId}`, userId, displayName, efficiency };
}

describe("partyTrains", () => {
  test("leaves you out: your own train is not a guest in your world", () => {
    const trains = partyTrains([member("me"), member("ada")], "conn-me");
    expect(trains).toHaveLength(1);
    expect(trains[0]?.id).toBe(partyTrainId("conn-ada"));
  });

  test("lanes follow arrival order, starting beside the local train", () => {
    const trains = partyTrains([member("ada"), member("bo"), member("cy")], "conn-me");
    expect(trains.map((t) => t.lane)).toEqual([1, 2, 3]);
  });

  test("stops at the lanes that fit on screen", () => {
    const crowd = Array.from({ length: MAX_PARTY_TRAINS + 3 }, (_, i) => member(`u${i}`));
    expect(partyTrains(crowd, "conn-me")).toHaveLength(MAX_PARTY_TRAINS);
  });

  test("carries the name and the reported focus onto the train", () => {
    const [train] = partyTrains([member("ada", "Ada", 0.9)], "conn-me");
    expect(train?.owner.name).toBe("Ada");
    expect(train?.efficiency).toBe(0.9);
    expect(train?.phase).toBe("running");
  });

  test("carries the focus time they banked, and none when an old client sent none", () => {
    const [banked, silent] = partyTrains(
      [{ ...member("ada"), focusedSeconds: 125 }, member("bo")],
      "me",
    );
    expect(banked?.focusedSeconds).toBe(125);
    expect(silent?.focusedSeconds).toBe(0);
  });

  test("a signed-out visitor sees everyone, since nobody is them", () => {
    expect(partyTrains([member("ada"), member("bo")], null)).toHaveLength(2);
  });
});

describe("arrivals", () => {
  // Arrivals are people, so `known` holds userIds: a friend whose socket
  // reconnected is the same person on a new connection, not a newcomer.
  const known = (...ids: string[]) => new Set(ids);

  test("finds the people who were not here last time", () => {
    expect(arrivals([member("ada"), member("bo")], known("ada"), "conn-me")).toEqual(["bo"]);
  });

  test("a friend whose socket reconnected is the same person, not an arrival", () => {
    const reconnected = { ...member("ada"), connectionId: "conn-ada-2" };
    expect(arrivals([reconnected], known("ada"), "conn-me")).toEqual([]);
  });

  test("you turning up is not someone joining", () => {
    expect(arrivals([member("me"), member("ada")], known("ada"), "conn-me")).toEqual([]);
  });

  test("a rename or a new score is not an arrival", () => {
    const before = [member("ada", "Ada", 0.2)];
    const after = [member("ada", "Ada the Swift", 0.9)];
    expect(arrivals(after, known(...before.map((m) => m.userId)), "conn-me")).toEqual([]);
  });

  test("someone who left and came back has joined again", () => {
    expect(arrivals([member("bo")], known("ada"), "conn-me")).toEqual(["bo"]);
  });

  test("an empty room announces nobody", () => {
    expect(arrivals([], known("ada"), "conn-me")).toEqual([]);
  });
});

test("two tabs of one browser are two riders with two trains", () => {
  // Same person, same stored userId, two sockets. This is what every local
  // test of the app looks like, and keying riders by userId made it a room of
  // one: no train, and nothing to regroup for.
  const first: ChatPresenceMember = {
    connectionId: "conn-a",
    userId: "same",
    displayName: "Kevin",
    efficiency: 0.4,
  };
  const second: ChatPresenceMember = { ...first, connectionId: "conn-b" };

  expect(partyTrains([first, second], "conn-a")).toHaveLength(1);
  // Your own second tab is still you: a train to look at, but nobody arrived,
  // so nothing regroups and nobody's score resets.
  expect(arrivals([first, second], new Set(), "conn-a")).toEqual([]);
  // One person, so one face, on whichever of them is drawn.
  expect(partyTrains([first, second], "conn-a")[0]?.owner.spriteUrl).toBe(spriteForUserId("same"));
});

describe("partyTrains with journeys", () => {
  const base = { connectionId: "conn-u2", userId: "u2", displayName: "Ada", efficiency: 0.5 };

  test("uses the rider's own avatar when presence carries one", () => {
    const [train] = partyTrains([{ ...base, avatar: "cat" }], "conn-me");
    expect(train?.owner.spriteUrl).toBe("/characters/cat.png");
  });

  test("falls back to the hashed sprite without an avatar", () => {
    const [train] = partyTrains([base], "conn-me");
    expect(train?.owner.spriteUrl).toBe(spriteForUserId("u2"));
  });

  test("stops at a station, on a break, or while answering; runs while studying", () => {
    const at = (state: Journey["state"]) =>
      partyTrains([{ ...base, journey: { state, station: { index: 1, total: 2 } } }], "conn-me")[0]
        ?.phase;
    expect(at("studying")).toBe("running");
    expect(at("at-station")).toBe("stopped");
    expect(at("answering")).toBe("stopped");
    expect(at("on-break")).toBe("stopped");
    expect(at("idle")).toBe("stopped");
    expect(at("finished")).toBe("finished");
  });

  test("a rider with no journey keeps running as before", () => {
    expect(partyTrains([base], "conn-me")[0]?.phase).toBe("running");
  });
});
