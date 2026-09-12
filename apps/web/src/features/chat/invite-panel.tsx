import { useState } from "react";
import { inviteLink } from "./api";
import { secondaryButtonClass } from "./ui";

export interface InvitePanelProps {
  inviteCode: string;
}

/** The invite code is the whole access control story: holding it gets you in. */
export function InvitePanel({ inviteCode }: InvitePanelProps) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(inviteLink(inviteCode));
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Clipboard blocked (insecure origin, or the user said no). The code is
      // on screen either way, so there is nothing to recover from.
    }
  }

  return (
    <button
      type="button"
      title="Copy the invite link"
      aria-label={`Copy the invite link, code ${inviteCode}`}
      className={`${secondaryButtonClass} bg-background/60 px-2 py-1 font-mono text-xs tracking-widest`}
      onClick={() => void copy()}
    >
      {copied ? "Copied" : inviteCode}
    </button>
  );
}
