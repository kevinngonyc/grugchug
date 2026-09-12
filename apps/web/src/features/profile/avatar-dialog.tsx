import { Dialog } from "@base-ui/react/dialog";
import type { AvatarId } from "@grugchug/shared";
import { useEffect, useRef, useState } from "react";
import { AvatarPicker } from "./avatar-picker";
import { useAvatarPickerUi } from "./avatar-picker-ui";
import { DEFAULT_AVATAR } from "./avatars";
import { useProfile } from "./store";

export function AvatarDialog() {
  const open = useAvatarPickerUi((s) => s.open);
  const setOpen = useAvatarPickerUi((s) => s.setOpen);
  const user = useProfile((s) => s.user);
  const status = useProfile((s) => s.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const pending = useRef(false);

  useEffect(() => () => useAvatarPickerUi.getState().setOpen(false), []);

  async function select(avatar: AvatarId) {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError(false);
    try {
      await useProfile.getState().setAvatar(avatar);
      if (useProfile.getState().status === "ready") setOpen(false);
      else setError(true);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[min(42rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-background p-6 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-4">
            <Dialog.Title className="text-xl font-semibold">Your character</Dialog.Title>
            <Dialog.Close className="rounded-md px-3 py-1 text-sm hover:bg-muted">
              Close
            </Dialog.Close>
          </div>
          <Dialog.Description className="mb-5 text-sm text-muted-foreground">
            Choose who rides in your carriage.
          </Dialog.Description>
          <AvatarPicker
            selected={user?.avatar ?? DEFAULT_AVATAR}
            onSelect={(id) => void select(id)}
            disabled={saving || status === "loading"}
          />
          {saving ? (
            <p role="status" className="mt-4 text-sm text-muted-foreground">
              Saving…
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              Couldn't save your character. Try again.
            </p>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
