import { Check, Link2 } from "lucide-react";
import { useEffect, useState } from "react";
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
  const [link, setLink] = useState<{ code: string; url: string } | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt deliberately retries the hostname request.
  useEffect(() => {
    setLink(null);
    setError(false);
    setCopied(false);
    if (!inviteCode) return;
    let disposed = false;
    const controller = new AbortController();
    void inviteLink(inviteCode, AbortSignal.any([controller.signal, AbortSignal.timeout(5_000)]))
      .then((url) => {
        if (!disposed) setLink({ code: inviteCode, url });
      })
      .catch(() => {
        if (!disposed) setError(true);
      });
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [inviteCode, attempt]);

  async function copy(): Promise<void> {
    if (!link || link.code !== inviteCode) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError(true);
    }
  }

  return (
    <button
      type="button"
      title={
        error ? "Could not prepare or copy the invite. Click to retry." : "Copy the invite link"
      }
      aria-label="Copy the invite link"
      disabled={!inviteCode || (!error && link?.code !== inviteCode)}
      className={`${secondaryButtonClass} shrink-0 gap-1.5 bg-background/60 px-2.5 py-1.5 text-xs`}
      onClick={() => (error ? setAttempt((value) => value + 1) : void copy())}
    >
      {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
      {error ? "Retry invite" : copied ? "Copied" : "Invite"}
    </button>
  );
}
