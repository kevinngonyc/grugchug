import { DISPLAY_NAME_MAX_LENGTH } from "@grugchug/shared";
import { useState } from "react";
import { useNavigate } from "react-router";
import { writeActiveRoomId } from "./active-room";
import { joinRoom } from "./api";
import { identityFromMember, readIdentity, writeIdentity } from "./identity";
import { buttonClass, cardClass, inputClass, labelClass } from "./ui";

export interface JoinRoomViewProps {
  inviteCode: string;
}

/** Landing page for an invite link: pick a name, and you are in. */
export function JoinRoomView({ inviteCode }: JoinRoomViewProps) {
  const navigate = useNavigate();
  const [identity] = useState(readIdentity);
  const [displayName, setDisplayName] = useState(identity?.displayName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await joinRoom({
        inviteCode,
        displayName,
        userId: identity?.userId ?? null,
      });
      writeIdentity(identityFromMember(response.member));
      // The room opens in the session overlay; there is no page of its own.
      writeActiveRoomId(response.room.id);
      void navigate("/session", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "could not join that room");
      setBusy(false);
    }
  }

  return (
    <form
      className={`${cardClass} flex max-w-md flex-col gap-3`}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h1 className="text-2xl font-semibold">Join the room</h1>
      <p className="text-sm text-muted-foreground">
        Invite code <code className="font-mono tracking-widest">{inviteCode.toUpperCase()}</code>
      </p>

      <label className={labelClass} htmlFor="join-display-name">
        Your name
      </label>
      <input
        id="join-display-name"
        className={inputClass}
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        placeholder="What should people call you?"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button type="submit" className={buttonClass} disabled={busy || displayName.trim() === ""}>
        Join
      </button>
    </form>
  );
}
