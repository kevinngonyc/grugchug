// Your name, always at the top of the chat. There is no "save": typing settles
// and the new name goes to the room, which is also what relabels your train.
import { DISPLAY_NAME_MAX_LENGTH } from "@grugchug/shared";
import { useEffect, useRef, useState } from "react";
import { inputClass } from "./ui";

/** How long typing has to stop before the room hears about it. */
export const NAME_COMMIT_DELAY_MS = 600;

export interface NameFieldProps {
  /** The name as everyone else currently knows it. */
  value: string;
  disabled?: boolean;
  onCommit: (displayName: string) => void;
}

export function NameField({ value, disabled = false, onCommit }: NameFieldProps) {
  const [draft, setDraft] = useState(value);
  // What we last agreed on with the outside world. Without it, the identity
  // updating in response to our own commit would yank the cursor mid-word.
  const settled = useRef(value);

  useEffect(() => {
    if (value === settled.current) return;
    settled.current = value;
    setDraft(value);
  }, [value]);

  useEffect(() => {
    const trimmed = draft.trim();
    // An empty field is someone clearing it to type a new name, not a request
    // to be nameless, so it commits nothing and keeps the last good name.
    if (trimmed === "" || trimmed === settled.current) return;

    const timer = setTimeout(() => {
      settled.current = trimmed;
      onCommit(trimmed);
    }, NAME_COMMIT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, onCommit]);

  return (
    <input
      className={`${inputClass} bg-background/60 py-1.5 font-medium`}
      maxLength={DISPLAY_NAME_MAX_LENGTH}
      placeholder="Your name"
      aria-label="Your name"
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
    />
  );
}
