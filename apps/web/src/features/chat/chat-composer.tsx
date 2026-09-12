import { MESSAGE_MAX_LENGTH } from "@grugchug/shared";
import { type KeyboardEvent, useState } from "react";
import { buttonClass, inputClass } from "./ui";

export interface ChatComposerProps {
  onSend: (body: string) => void;
  disabled?: boolean;
}

export function ChatComposer({ onSend, disabled = false }: ChatComposerProps) {
  const [value, setValue] = useState("");

  function submit(): void {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  }

  // Enter sends, Shift+Enter starts a new line — what people expect from chat.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form
      className="flex items-end gap-2 border-t pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        className={`${inputClass} min-h-[2.5rem] resize-none`}
        rows={1}
        maxLength={MESSAGE_MAX_LENGTH}
        placeholder="Message"
        aria-label="Message"
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <button type="submit" className={buttonClass} disabled={disabled || value.trim() === ""}>
        Send
      </button>
    </form>
  );
}
