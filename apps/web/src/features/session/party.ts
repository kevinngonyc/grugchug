// Turning the chat roster into trains. Pure: no store, no React, so the lane
// order and the cut-off are testable on their own.
//
// The people in your room are the people on the track beside you. They arrive
// when they open the app and they are gone when they close it, because that is
// exactly what the roster is.
import type { ChatPresenceMember, Journey, TrainPhase, TrainState } from "@grugchug/shared";
import { avatarUrl } from "@/features/profile";
import { spriteForUserId } from "@/lib/sprite-for-user";

/**
 * Your own train is `local` and rides lane 0; everyone else is prefixed and
 * keyed by their connection, so a friend who reconnects gets a fresh train
 * that pulls up level rather than inheriting the old one's place.
 */
export const PARTY_TRAIN_PREFIX = "party:";

/**
 * How many friends fit on screen. Lanes run away from the camera, so past a
 * handful the furthest train is a speck behind three others; the rest of the
 * room is still in the chat, just not on the track.
 */
export const MAX_PARTY_TRAINS = 4;

// Re-exported so existing imports of `spriteForUserId` from this module (and
// from `features/session`) keep working; chat's roster shares this same
// implementation via `@/lib/sprite-for-user` so the two never disagree, and
// the same face carries across your own two tabs, which are two riders but
// one person.
export { spriteForUserId };

/**
 * Who in this roster was not in the one before it, you excepted.
 *
 * Arrivals are what call the world to a standstill, so this is about people
 * rather than about sockets: `known` holds userIds and so does the result. A
 * rename or a new focus score is not an arrival, and neither is the same
 * person back on a fresh connection — a wifi blip, an API restart, or a
 * second tab of the browser you are in (which still gets a train, see
 * partyTrains). Someone who closed the app and came back is, because they
 * left the room in between.
 */
export function arrivals(
  members: readonly ChatPresenceMember[],
  known: ReadonlySet<string>,
  selfId: string | null,
): string[] {
  const selfUserId = members.find((member) => member.connectionId === selfId)?.userId;
  const arrived: string[] = [];
  for (const member of members) {
    if (member.connectionId === selfId || member.userId === selfUserId) continue;
    if (known.has(member.userId) || arrived.includes(member.userId)) continue;
    arrived.push(member.userId);
  }
  return arrived;
}

export function partyTrainId(userId: string): string {
  return `${PARTY_TRAIN_PREFIX}${userId}`;
}

export function isPartyTrainId(id: string): boolean {
  return id.startsWith(PARTY_TRAIN_PREFIX);
}

// A friend's phase follows their journey. No journey means an older client
// that never said, and those keep running as companions always did.
export function phaseForJourney(journey: Journey | undefined): TrainPhase {
  if (!journey) return "running";
  if (journey.state === "studying") return "running";
  if (journey.state === "finished") return "finished";
  return "stopped";
}

/**
 * The trains that should exist for everyone else in the room, in lane order.
 * The roster arrives in the order people connected, so a newcomer pulls up on
 * the far side rather than shuffling everyone who was already here.
 *
 * A friend's train is a companion, not a status light, but it is also honest
 * about their route: it stops when they do, and wears their own avatar when
 * they have picked one.
 */
export function partyTrains(
  members: readonly ChatPresenceMember[],
  selfId: string | null,
): TrainState[] {
  return members
    .filter((member) => member.connectionId !== selfId)
    .slice(0, MAX_PARTY_TRAINS)
    .map((member, index) => ({
      id: partyTrainId(member.connectionId),
      owner: {
        name: member.displayName,
        spriteUrl: member.avatar ? avatarUrl(member.avatar) : spriteForUserId(member.userId),
      },
      phase: phaseForJourney(member.journey),
      efficiency: Math.min(1, Math.max(0, member.efficiency)),
      focusedSeconds: Math.max(0, member.focusedSeconds ?? 0),
      lane: index + 1,
    }));
}
