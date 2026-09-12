import { useEffect } from "react";
import { AvatarPicker, useProfile } from "@/features/profile";

export function Settings() {
  const user = useProfile((s) => s.user);
  const status = useProfile((s) => s.status);
  const load = useProfile((s) => s.load);
  const setAvatar = useProfile((s) => s.setAvatar);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Your character</h2>
        <AvatarPicker
          selected={user?.avatar}
          onSelect={(id) => void setAvatar(id)}
          disabled={status === "loading"}
        />
        {status === "error" ? (
          <p className="text-destructive text-sm">
            Couldn't reach the server, so your pick won't be saved.
          </p>
        ) : null}
      </section>
    </div>
  );
}
