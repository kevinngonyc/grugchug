// Top-left of the session: everyone's face ringed by their live focus, in
// lane order like the trains themselves, and under it who has banked the most
// focused time today. Steps aside while the conductor is open, since the ask
// panel takes that side of the screen.
import { useShallow } from "zustand/react/shallow";
import { useConductorUi } from "@/features/conductor";
import { useWorld } from "@/features/world";
import { FocusRing } from "./focus-ring";
import { assignColors } from "./player-color";
import { formatFocusTime, rankTrains } from "./ranking";

export function FocusBoard({ onSelectCharacter }: { onSelectCharacter?: () => void }) {
  const trains = useWorld(useShallow((s) => Object.values(s.trains)));
  const localTrainId = useWorld((s) => s.localTrainId);
  const conductorOpen = useConductorUi((s) => s.open);

  if (conductorOpen || trains.length === 0) return null;

  const colors = assignColors(trains, localTrainId);
  const byLane = [...trains].sort((a, b) => a.lane - b.lane || a.id.localeCompare(b.id));
  const ranked = rankTrains(trains);

  return (
    <div className="absolute top-4 left-4 z-10 flex w-60 flex-col gap-2 font-mono">
      <ul aria-label="Live focus" className="flex flex-wrap gap-2">
        {byLane.map((train) => {
          const color = colors.get(train.id) ?? "#64748b";
          const percent = Math.round(train.efficiency * 100);
          return (
            <li
              key={train.id}
              title={`${train.owner.name} · ${percent}% focus`}
              className="flex flex-col items-center gap-0.5"
            >
              {train.id === localTrainId && onSelectCharacter ? (
                <button
                  type="button"
                  aria-label="Change your character"
                  title="Change your character"
                  onClick={onSelectCharacter}
                  className="rounded-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <FocusRing
                    src={train.owner.spriteUrl}
                    name={train.owner.name}
                    fraction={train.efficiency}
                    color={color}
                  />
                </button>
              ) : (
                <FocusRing
                  src={train.owner.spriteUrl}
                  name={train.owner.name}
                  fraction={train.efficiency}
                  color={color}
                />
              )}
              <span
                className="rounded bg-white/90 px-1 text-[0.65rem] font-semibold tabular-nums"
                style={{ color }}
              >
                {percent}%
              </span>
            </li>
          );
        })}
      </ul>

      <section aria-label="Focus leaderboard" className="rounded-lg bg-white/90 p-2 text-xs shadow">
        <h2 className="px-1 pb-1 font-semibold text-muted-foreground">Focus time today</h2>
        <ol className="flex flex-col gap-0.5">
          {ranked.map((train, i) => (
            <li
              key={train.id}
              className={`flex items-center gap-2 rounded px-1 py-0.5 ${
                train.id === localTrainId ? "bg-primary/10 font-semibold" : ""
              }`}
            >
              <span className="w-4 text-right tabular-nums">{i + 1}</span>
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colors.get(train.id) }}
              />
              <span className="min-w-0 flex-1 truncate">{train.owner.name}</span>
              <span className="tabular-nums">{formatFocusTime(train.focusedSeconds ?? 0)}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
