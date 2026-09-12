// The picker: name yourself, then start a room or join one with a code. Hands
// the chosen room back to whoever mounted it; it does no routing of its own.
import type { ChatRoom } from "@grugchug/shared";
import {
  DISPLAY_NAME_MAX_LENGTH,
  INVITE_CODE_LENGTH,
  ROOM_NAME_MAX_LENGTH,
} from "@grugchug/shared";
import { useEffect, useState } from "react";
import { getUserId } from "@/lib/user-id";
import { createRoom, joinRoom, listRooms } from "./api";
import { type ChatIdentity, identityFromMember, readIdentity, writeIdentity } from "./identity";
import { buttonClass, inputClass, labelClass } from "./ui";

export interface ChatRoomsViewProps {
  onOpenRoom: (roomId: string) => void;
}

export function ChatRoomsView({ onOpenRoom }: ChatRoomsViewProps) {
  const [identity, setIdentity] = useState<ChatIdentity | null>(readIdentity);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [displayName, setDisplayName] = useState(identity?.displayName ?? "");
  const [roomName, setRoomName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    listRooms(identity.userId)
      .then((found) => {
        if (!cancelled) setRooms(found);
      })
      .catch(() => {
        // An empty list is a fine fallback here; the forms below still work.
      });
    return () => {
      cancelled = true;
    };
  }, [identity]);

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function onCreate(): Promise<void> {
    return run(async () => {
      const response = await createRoom({
        name: roomName,
        displayName,
        userId: identity?.userId ?? getUserId(),
      });
      setIdentity(writeIdentity(identityFromMember(response.member)));
      setRoomName("");
      onOpenRoom(response.room.id);
    });
  }

  function onJoin(): Promise<void> {
    return run(async () => {
      const response = await joinRoom({
        inviteCode,
        displayName,
        userId: identity?.userId ?? getUserId(),
      });
      setIdentity(writeIdentity(identityFromMember(response.member)));
      setInviteCode("");
      onOpenRoom(response.room.id);
    });
  }

  const nameMissing = displayName.trim() === "";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <h2 className="text-sm font-semibold">Chat</h2>

      <div className="flex flex-col gap-1.5">
        <label className={labelClass} htmlFor="chat-display-name">
          Your name
        </label>
        <input
          id="chat-display-name"
          className={inputClass}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          placeholder="What should people call you?"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">Shown next to your messages.</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Your rooms</h3>
        {rooms.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No rooms yet. Start one below, or join with a code someone sent you.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {rooms.map((room) => (
              <li key={room.id}>
                <button
                  type="button"
                  onClick={() => onOpenRoom(room.id)}
                  className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span className="truncate font-medium">{room.name}</span>
                  <code className="font-mono text-xs tracking-widest text-muted-foreground">
                    {room.inviteCode}
                  </code>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void onCreate();
        }}
      >
        <h3 className="text-sm font-semibold">Start a room</h3>
        <input
          className={inputClass}
          maxLength={ROOM_NAME_MAX_LENGTH}
          placeholder="Room name"
          aria-label="Room name"
          value={roomName}
          onChange={(event) => setRoomName(event.target.value)}
        />
        <button
          type="submit"
          className={buttonClass}
          disabled={busy || nameMissing || roomName.trim() === ""}
        >
          Create and get an invite link
        </button>
      </form>

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void onJoin();
        }}
      >
        <h3 className="text-sm font-semibold">Join a room</h3>
        <input
          className={`${inputClass} font-mono tracking-widest uppercase`}
          maxLength={INVITE_CODE_LENGTH}
          placeholder="Invite code"
          aria-label="Invite code"
          value={inviteCode}
          onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
        />
        <button
          type="submit"
          className={buttonClass}
          disabled={busy || nameMissing || inviteCode.trim().length !== INVITE_CODE_LENGTH}
        >
          Join
        </button>
      </form>
    </div>
  );
}
