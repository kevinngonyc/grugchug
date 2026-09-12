import { beforeEach, expect, test } from "bun:test";
import type { ChatIdentity, ChatPresenceMember } from "@/features/chat";
import { useWorld } from "@/features/world";
import { partyTrainId } from "./party";
import { syncPartyTrains } from "./use-party-trains";

const identity: ChatIdentity = { userId: "self", displayName: "Cat rider" };
const roster: ChatPresenceMember[] = [
  { ...identity, efficiency: 0.5 },
  { userId: "friend", displayName: "Friend", efficiency: 0.6 },
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
  const known = syncPartyTrains(roster, identity, new Set());
  expect(useWorld.getState().trains.local?.owner).toEqual({
    name: "Cat rider",
    spriteUrl: "/characters/cat.png",
  });
  useWorld.getState().setOwner("local", { name: "Cat rider", spriteUrl: "/characters/doug.png" });
  syncPartyTrains(roster, identity, known);
  expect(useWorld.getState().trains.local?.owner.spriteUrl).toBe("/characters/doug.png");
});

test("a friend's focus update preserves their active speech without regrouping", () => {
  const known = syncPartyTrains(roster, identity, new Set());
  const id = partyTrainId("friend");
  useWorld.getState().say(id, "Keep going", "/audio/start_session1.mp3");
  const speech = useWorld.getState().trains[id]?.speech;
  const regroups = useWorld.getState().regroups;
  syncPartyTrains(
    roster.map((member) => ({ ...member, efficiency: 0.9 })),
    identity,
    known,
  );
  expect(useWorld.getState().trains[id]?.speech).toEqual(speech);
  expect(useWorld.getState().trains[id]?.efficiency).toBe(0.9);
  expect(useWorld.getState().regroups).toBe(regroups);
});

test("presence never brings back a line that the speech player already cleared", () => {
  const known = syncPartyTrains(roster, identity, new Set());
  const id = partyTrainId("friend");
  useWorld.getState().say(id, "Keep going");
  const speech = useWorld.getState().trains[id]?.speech;
  if (!speech) throw new Error("Expected active speech");
  useWorld.getState().clearSpeech(id, speech.id);
  syncPartyTrains(roster, identity, known);
  expect(useWorld.getState().trains[id]?.speech).toBeUndefined();
});
