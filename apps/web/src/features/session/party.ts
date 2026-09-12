// Turning the chat roster into trains. Pure: no store, no React, so the lane
// order and the cut-off are testable on their own.
//
// The people in your room are the people on the track beside you. They arrive
// when they open the app and they are gone when they close it, because that is
// exactly what the roster is.
import type { ChatPresenceMember, TrainState } from "@grugchug/shared";

/** Your own train is `local` and rides lane 0; everyone else is prefixed. */
export const PARTY_TRAIN_PREFIX = "party:";

/**
 * How many friends fit on screen. Lanes run away from the camera, so past a
 * handful the furthest train is a speck behind three others; the rest of the
 * room is still in the chat, just not on the track.
 */
export const MAX_PARTY_TRAINS = 4;

// Every rider needs a face. Sprites are assigned from the userId rather than
// handed out in arrival order, so you look the same on your friend's screen as
// you do on your own.
export const PARTY_SPRITES = [
  "/characters/poku.png",
  "/characters/bonbon.png",
  "/characters/default.svg",
] as const;

export function spriteForUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) % 0x7fffffff;
  return PARTY_SPRITES[hash % PARTY_SPRITES.length] ?? PARTY_SPRITES[0];
}

/**
 * Who in this roster was not in the last one, you excepted. Arrivals are what
 * call the world to a standstill, so this has to be about people rather than
 * about the roster changing: a rename or a new focus score is not an arrival.
 */
export function arrivals(
  members: readonly ChatPresenceMember[],
  known: ReadonlySet<string>,
  selfId: string | null,
): string[] {
  return members
    .filter((member) => member.userId !== selfId && !known.has(member.userId))
    .map((member) => member.userId);
}

export function partyTrainId(userId: string): string {
  return `${PARTY_TRAIN_PREFIX}${userId}`;
}

export function isPartyTrainId(id: string): boolean {
  return id.startsWith(PARTY_TRAIN_PREFIX);
}

/**
 * The trains that should exist for everyone else in the room, in lane order.
 * The roster arrives in the order people connected, so a newcomer pulls up on
 * the far side rather than shuffling everyone who was already here.
 *
 * They are always `running`: a friend's train is a companion, not a status
 * light, and stopping is a decision about your own session.
 */
export function partyTrains(
  members: readonly ChatPresenceMember[],
  selfId: string | null,
): TrainState[] {
  return members
    .filter((member) => member.userId !== selfId)
    .slice(0, MAX_PARTY_TRAINS)
    .map((member, index) => ({
      id: partyTrainId(member.userId),
      owner: { name: member.displayName, spriteUrl: spriteForUserId(member.userId) },
      phase: "running" as const,
      efficiency: Math.min(1, Math.max(0, member.efficiency)),
      lane: index + 1,
    }));
}
