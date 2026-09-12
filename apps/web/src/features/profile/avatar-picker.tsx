import type { AvatarId } from "@grugchug/shared";
import { cn } from "@/lib/utils";
import { AVATARS } from "./avatars";

type AvatarPickerProps = {
  selected: AvatarId | undefined;
  onSelect: (id: AvatarId) => void;
  disabled?: boolean;
};

// One button per drawing. Presentational: the page that renders it owns the
// store, so this stays testable without fetch.
export function AvatarPicker({ selected, onSelect, disabled = false }: AvatarPickerProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {AVATARS.map((avatar) => {
        const pressed = avatar.id === selected;
        return (
          <button
            key={avatar.id}
            type="button"
            aria-pressed={pressed}
            disabled={disabled}
            onClick={() => onSelect(avatar.id)}
            className={cn(
              "flex w-28 flex-col items-center gap-1 rounded-lg border p-2 text-sm",
              pressed ? "border-primary bg-primary/10" : "hover:bg-muted",
              disabled && "opacity-60",
            )}
          >
            <img src={avatar.url} alt="" className="size-20" />
            {avatar.name}
          </button>
        );
      })}
    </div>
  );
}
