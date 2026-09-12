import { Check, Link2 } from "lucide-react";
import { useState } from "react";
import { inviteLink } from "./api";
import { secondaryButtonClass } from "./ui";

export interface InvitePanelProps {
  /** Null until the room has been resolved. */
  inviteCode: string | null;
}

/**
 * The invite link is the whole access control story, and the only way in:
 * holding it gets you into the room. It sits at the top of the chat
 * permanently because sending it to someone is the point of the room.
 */
export function InvitePanel({ inviteCode }: InvitePanelProps) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteLink(inviteCode));
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Clipboard blocked (insecure origin, or the user said no). Nothing is
      // lost: the link is the page origin plus the code, and reloading offers
      // the button again.
    }
  }

  return (
    <button
      type="button"
      title="Copy the invite link"
      aria-label="Copy the invite link"
      disabled={!inviteCode}
      className={`${secondaryButtonClass} shrink-0 gap-1.5 bg-background/60 px-2.5 py-1.5 text-xs`}
      onClick={() => void copy()}
    >
      {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
      {copied ? "Copied" : "Invite"}
    </button>
  );
}
