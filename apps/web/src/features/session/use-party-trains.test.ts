import { beforeEach, expect, test } from "bun:test";
import type { ChatPresenceMember } from "@/features/chat";
import { EFFICIENCY_SCORE_NEUTRAL, useEfficiency } from "@/features/efficiency";
import { useWorld } from "@/features/world";
import { partyTrainId } from "./party";
import { syncPartyTrains } from "./use-party-trains";

const SELF = "conn-self";
const roster: ChatPresenceMember[] = [
  { connectionId: SELF, userId: "self", displayName: "Cat rider", efficiency: 0.5 },
  { connectionId: "conn-friend", userId: "friend", displayName: "Friend", efficiency: 0.6 },
];

beforeEach(() => {
  useWorld.setState({ trains: {}, localTrainId: null, regroups: 0 });
  const world = useWorld.getState();
  world.addTrain({
    id: "local",
    owner: { name: "You", spriteUrl: "/characters/cat.png" },
    phase: "running",
    efficiency: 0.5,
    lane: 0,
  });
  world.setLocalTrainId("local");
});

test("presence updates the local chat name without replacing the chosen avatar", () => {
  const known = syncPartyTrains(roster, SELF, new Set());
  expect(useWorld.getState().trains.local?.owner).toEqual({
    name: "Cat rider",
    spriteUrl: "/characters/cat.png",
  });
  useWorld.getState().setOwner("local", { name: "Cat rider", spriteUrl: "/characters/doug.png" });
  syncPartyTrains(roster, SELF, known);
  expect(useWorld.getState().trains.local?.owner.spriteUrl).toBe("/characters/doug.png");
});

test("a friend's focus update preserves their active speech without regrouping", () => {
  const known = syncPartyTrains(roster, SELF, new Set());
  const id = partyTrainId("conn-friend");
  useWorld.getState().say(id, "Keep going", "/audio/start_sessioncensored.mp3");
  const speech = useWorld.getState().trains[id]?.speech;
  const regroups = useWorld.getState().regroups;
  syncPartyTrains(
    roster.map((member) => ({ ...member, efficiency: 0.9 })),
    SELF,
    known,
  );
  expect(useWorld.getState().trains[id]?.speech).toEqual(speech);
  expect(useWorld.getState().trains[id]?.efficiency).toBe(0.9);
  expect(useWorld.getState().regroups).toBe(regroups);
});

test("presence never brings back a line that the speech player already cleared", () => {
  const known = syncPartyTrains(roster, SELF, new Set());
  const id = partyTrainId("conn-friend");
  useWorld.getState().say(id, "Keep going");
  const speech = useWorld.getState().trains[id]?.speech;
  if (!speech) throw new Error("Expected active speech");
  useWorld.getState().clearSpeech(id, speech.id);
  syncPartyTrains(roster, SELF, known);
  expect(useWorld.getState().trains[id]?.speech).toBeUndefined();
});

test("somebody turning up puts everyone's focus score back to neutral", () => {
  const store = useEfficiency.getState();
  store.reset();
  store.report("quiz", 1, { weight: 1 });
  expect(useEfficiency.getState().score).toBeGreaterThan(90);

  const alone = [roster[0] as ChatPresenceMember];
  const known = syncPartyTrains(alone, SELF, new Set());
  expect(useEfficiency.getState().score).toBeGreaterThan(90);

  syncPartyTrains(roster, SELF, known);
  expect(useEfficiency.getState().score).toBe(EFFICIENCY_SCORE_NEUTRAL);
});

test("a dropped socket coming back does not reset anyone's score", () => {
  const store = useEfficiency.getState();
  store.reset();
  let known = syncPartyTrains(roster, SELF, new Set());
  store.report("quiz", 1, { weight: 1 });
  expect(useEfficiency.getState().score).toBeGreaterThan(90);

  // The roster empties while the socket is down and refills on reconnect.
  known = syncPartyTrains([], SELF, known);
  syncPartyTrains(roster, SELF, known);
  expect(useEfficiency.getState().score).toBeGreaterThan(90);
});

test("the line regroups when anyone turns up, including coming back", () => {
  const alone = [roster[0] as ChatPresenceMember];
  const together = roster;

  // You, by yourself: nobody has arrived but you, and you are already here.
  let known = syncPartyTrains(alone, SELF, new Set());
  expect(useWorld.getState().regroups).toBe(0);

  // A friend turns up.
  known = syncPartyTrains(together, SELF, known);
  expect(useWorld.getState().regroups).toBe(1);

  // They say something and their focus moves. Neither is an arrival.
  known = syncPartyTrains(
    together.map((member) => ({ ...member, efficiency: 0.9 })),
    SELF,
    known,
  );
  known = syncPartyTrains(
    together.map((member) => ({ ...member, displayName: "Renamed" })),
    SELF,
    known,
  );
  expect(useWorld.getState().regroups).toBe(1);

  // They close the tab, then come back. Coming back is joining.
  known = syncPartyTrains(alone, SELF, known);
  expect(useWorld.getState().regroups).toBe(1);
  known = syncPartyTrains(together, SELF, known);
  expect(useWorld.getState().regroups).toBe(2);

  // The socket drops — the roster empties because there is nothing to report,
  // not because the room did — and reconnects. Nobody joined, so nothing
  // regroups.
  known = syncPartyTrains([], SELF, known);
  expect(useWorld.getState().regroups).toBe(2);
  known = syncPartyTrains(together, SELF, known);
  expect(useWorld.getState().regroups).toBe(2);

  // The friend's own socket drops and comes back under a new connection id.
  // Same person, so still not an arrival.
  const friend = roster[1] as ChatPresenceMember;
  syncPartyTrains(
    [roster[0] as ChatPresenceMember, { ...friend, connectionId: "conn-friend-2" }],
    SELF,
    known,
  );
  expect(useWorld.getState().regroups).toBe(2);
});
