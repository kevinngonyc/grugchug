// Resolves the one room this browser is in, and the identity that goes with
// it. There is no picker and no create step: asking for your room is what
// makes it the first time, and opening an invite link is what moves you into
// someone else's.
import type { ChatRoom } from "@grugchug/shared";
import { useCallback, useEffect, useState } from "react";
import { getUserId } from "@/lib/user-id";
import { myRoom } from "./api";
import {
  type ChatIdentity,
  defaultDisplayName,
  identityFromMember,
  readIdentity,
  writeIdentity,
} from "./identity";

export interface MyRoomState {
  room: ChatRoom | null;
  identity: ChatIdentity | null;
  error: string | null;
  /** Record a new display name locally. Telling the room is the socket's job. */
  setLocalName: (displayName: string) => void;
}

export function useMyRoom(): MyRoomState {
  // Seeded from storage so the name field is filled in before the round trip.
  const [identity, setIdentity] = useState<ChatIdentity | null>(readIdentity);
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const stored = readIdentity();

    myRoom({
      displayName: stored?.displayName ?? defaultDisplayName(),
      userId: stored?.userId ?? getUserId(),
    })
      .then((response) => {
        if (cancelled) return;
        setIdentity(writeIdentity(identityFromMember(response.member)));
        setRoom(response.room);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "could not reach the chat");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setLocalName = useCallback((displayName: string) => {
    setIdentity((current) => (current ? writeIdentity({ ...current, displayName }) : current));
  }, []);

  return { room, identity, error, setLocalName };
}
