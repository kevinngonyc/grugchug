// The roster, as trains. features/session owns roster updates in
// features/world: chat reports who is connected, this decides what that means
// for the world, and the scene draws it.
import { useEffect, useRef } from "react";
import { type ChatPresenceMember, useRoster, useRosterSelfId } from "@/features/chat";
import { useEfficiency } from "@/features/efficiency";
import { useWorld } from "@/features/world";
import { arrivals, isPartyTrainId, partyTrains } from "./party";

export function usePartyTrains(): void {
  const roster = useRoster();
  // Our own socket, as the server named it. Deliberately not read from stored
  // identity: that key is shared by every tab of this browser, so a second tab
  // joining would overwrite it and leave this one mistaking a friend for
  // itself — drawing a train for itself and none for them.
  const selfId = useRosterSelfId();
  // Who was in the previous roster, so an arrival can be told from a rename.
  const known = useRef<ReadonlySet<string>>(new Set());

  useEffect(() => {
    known.current = syncPartyTrains(roster, selfId, known.current);
  }, [roster, selfId]);
}

// Apply presence without overwriting fields owned by profile or speech.
export function syncPartyTrains(
  roster: readonly ChatPresenceMember[],
  selfId: string | null,
  known: ReadonlySet<string>,
): ReadonlySet<string> {
  const world = useWorld.getState();

  // Your own train is created by the session, not by the roster, but the name
  // comes from chat — from the server's copy of it, which is the same string
  // everyone else in the room sees. Its chosen passenger stays the profile's.
  const self = roster.find((member) => member.connectionId === selfId);
  const local = world.localTrainId ? world.trains[world.localTrainId] : undefined;
  if (self && local) {
    world.setOwner(local.id, { ...local.owner, name: self.displayName });
  }

  // Every roster is compared with the one before it, by person. An empty
  // roster is a dropped socket, not an empty room — the server never sends
  // one, since you are always in your own roster — so `known` is kept through
  // it and the reconnect that follows does not read as everyone arriving.
  //
  // Somebody turning up restarts the sitting for everyone present. The focus
  // score returns to neutral and is earned up or down from there, so nobody
  // is a hundred metres up the line on credit from before the newcomer
  // arrived, and nobody who was slacking is punished for it either; every
  // client in the room sees the same arrival and does the same thing, so the
  // whole party levels together. `regroup()` lines the trains up to match.
  if (roster.length > 0) {
    if (arrivals(roster, known, selfId).length > 0) {
      useEfficiency.getState().neutralize();
      world.regroup();
    }
    known = new Set(
      roster.filter((member) => member.connectionId !== selfId).map((member) => member.userId),
    );
  }

  const wanted = partyTrains(roster, selfId);
  const wantedIds = new Set(wanted.map((train) => train.id));

  for (const id of Object.keys(world.trains)) {
    if (isPartyTrainId(id) && !wantedIds.has(id)) world.removeTrain(id);
  }
  // Presence owns identity and focus, while speech owns the current line.
  for (const train of wanted) {
    const speech = world.trains[train.id]?.speech;
    world.addTrain({ ...train, ...(speech ? { speech } : {}) });
  }
  return known;
}
