// The roster, as trains. features/session owns roster updates in
// features/world: chat reports who is connected, this decides what that means
// for the world, and the scene draws it.
import { useEffect, useRef } from "react";
import {
  type ChatIdentity,
  type ChatPresenceMember,
  readIdentity,
  useRoster,
} from "@/features/chat";
import { useWorld } from "@/features/world";
import { arrivals, isPartyTrainId, partyTrains } from "./party";

export function usePartyTrains(): void {
  const roster = useRoster();
  // Who was here last time. Survives an empty roster on purpose — see below.
  const known = useRef<ReadonlySet<string>>(new Set());

  useEffect(() => {
    known.current = syncPartyTrains(roster, readIdentity(), known.current);
  }, [roster]);
}

// Apply presence without overwriting fields owned by profile or speech.
export function syncPartyTrains(
  roster: readonly ChatPresenceMember[],
  identity: ChatIdentity | null,
  known: ReadonlySet<string>,
): ReadonlySet<string> {
  const selfId = identity?.userId ?? null;
  const world = useWorld.getState();

  // Your own train is created by the session, not by the roster, but the
  // name comes from chat; its chosen passenger stays owned by the profile.
  const local = world.localTrainId ? world.trains[world.localTrainId] : undefined;
  if (identity && local) {
    world.setOwner(local.id, {
      ...local.owner,
      name: identity.displayName,
    });
  }

  // An empty roster means the socket is down, not that the room emptied —
  // you are always in your own roster. Holding on to who was here is what
  // keeps a reconnect from reading as everyone arriving at once.
  if (roster.length > 0) {
    if (arrivals(roster, known, selfId).length > 0) world.regroup();
    known = new Set(
      roster.filter((member) => member.userId !== selfId).map((member) => member.userId),
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
