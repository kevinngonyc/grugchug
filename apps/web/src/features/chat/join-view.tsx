// The landing page for an invite link, which is the only way into someone
// else's room. There is nothing to fill in: you are joined with whatever name
// this browser already goes by — or a made-up one on a first visit — and
// dropped straight into the session, where the name field is waiting at the
// top of the chat if you want a different one.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { getUserId } from "@/lib/user-id";
import { joinRoom } from "./api";
import { defaultDisplayName, identityFromMember, readIdentity, writeIdentity } from "./identity";
import { cardClass } from "./ui";

export interface JoinRoomViewProps {
  inviteCode: string;
}

export function JoinRoomView({ inviteCode }: JoinRoomViewProps) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const stored = readIdentity();

    joinRoom({
      inviteCode,
      displayName: stored?.displayName ?? defaultDisplayName(),
      userId: stored?.userId ?? getUserId(),
    })
      .then((response) => {
        if (cancelled) return;
        writeIdentity(identityFromMember(response.member));
        // Joining is the last thing that names a room, and the room you are in
        // is the last one you joined, so nothing has to be remembered here.
        void navigate("/session", { replace: true });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "could not join that room");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [inviteCode, navigate]);

  return (
    <div className={`${cardClass} flex max-w-md flex-col gap-2`}>
      <h1 className="text-2xl font-semibold">{error ? "That link did not work" : "Joining…"}</h1>
      <p className="text-sm text-muted-foreground">
        {error ?? "Pulling your train onto the same track."}
      </p>
    </div>
  );
}
