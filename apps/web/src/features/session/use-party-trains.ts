// The roster, as trains. features/session stays the only writer into
// features/world: chat reports who is connected, this decides what that means
// for the world, and the scene draws it.
import { useEffect, useRef } from "react";
import { readIdentity, useRoster } from "@/features/chat";
import { useWorld } from "@/features/world";
import { arrivals, isPartyTrainId, partyTrains, spriteForUserId } from "./party";

export function usePartyTrains(): void {
  const roster = useRoster();
  // Who was here last time. Survives an empty roster on purpose — see below.
  const known = useRef<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const identity = readIdentity();
    const selfId = identity?.userId ?? null;
    const world = useWorld.getState();

    // Your own train is created by the session, not by the roster, but the
    // name and face on it come from the same identity everyone else sees.
    if (identity && world.localTrainId) {
      world.setOwner(world.localTrainId, {
        name: identity.displayName,
        spriteUrl: spriteForUserId(identity.userId),
      });
    }

    // An empty roster means the socket is down, not that the room emptied —
    // you are always in your own roster. Holding on to who was here is what
    // keeps a reconnect from reading as everyone arriving at once.
    if (roster.length > 0) {
      if (arrivals(roster, known.current, selfId).length > 0) world.regroup();
      known.current = new Set(
        roster.filter((member) => member.userId !== selfId).map((member) => member.userId),
      );
    }

    const wanted = partyTrains(roster, selfId);
    const wantedIds = new Set(wanted.map((train) => train.id));

    for (const id of Object.keys(world.trains)) {
      if (isPartyTrainId(id) && !wantedIds.has(id)) world.removeTrain(id);
    }
    // addTrain replaces wholesale, which is the whole update: a train carries
    // no state of its own beyond what the roster just told us.
    for (const train of wanted) world.addTrain(train);
  }, [roster]);
}
