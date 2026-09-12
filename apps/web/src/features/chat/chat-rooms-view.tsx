import type { ChatRoom } from "@grugchug/shared";
import {
  DISPLAY_NAME_MAX_LENGTH,
  INVITE_CODE_LENGTH,
  ROOM_NAME_MAX_LENGTH,
} from "@grugchug/shared";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { getUserId } from "@/lib/user-id";
import { createRoom, joinRoom, listRooms } from "./api";
import { type ChatIdentity, identityFromMember, readIdentity, writeIdentity } from "./identity";
import { buttonClass, cardClass, inputClass, labelClass } from "./ui";

export function ChatRoomsView() {
  const navigate = useNavigate();
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
      void navigate(`/chat/${response.room.id}`);
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
      void navigate(`/chat/${response.room.id}`);
    });
  }

  const nameMissing = displayName.trim() === "";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Chat</h1>

      <div className="flex max-w-md flex-col gap-2">
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
        <p className="text-xs text-muted-foreground">
          Shown next to your messages. You can use a different one per room.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <form
          className={`${cardClass} flex flex-col gap-3`}
          onSubmit={(event) => {
            event.preventDefault();
            void onCreate();
          }}
        >
          <h2 className="font-semibold">Start a room</h2>
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
          className={`${cardClass} flex flex-col gap-3`}
          onSubmit={(event) => {
            event.preventDefault();
            void onJoin();
          }}
        >
          <h2 className="font-semibold">Join a room</h2>
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

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Your rooms</h2>
        {rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No rooms yet. Start one above, or join with a code someone sent you.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rooms.map((room) => (
              <li key={room.id}>
                <Link
                  to={`/chat/${room.id}`}
                  className={`${cardClass} flex items-center justify-between hover:bg-accent`}
                >
                  <span className="font-medium">{room.name}</span>
                  <code className="font-mono text-xs tracking-widest text-muted-foreground">
                    {room.inviteCode}
                  </code>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
