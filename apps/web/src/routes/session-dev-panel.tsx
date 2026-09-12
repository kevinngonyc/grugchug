import { useEffect, useRef } from "react";
import { effectiveWeight, useEfficiency } from "@/features/efficiency";
import { type TrainPhase, useWorld } from "@/features/world";
import { cn } from "@/lib/utils";

const FRIEND_NAMES = ["Ada", "Grace", "Linus", "Margaret", "Dennis"];
const PHASES: TrainPhase[] = ["running", "stopped", "finished"];

// A dev-only signal, reported through the same API a quiz would use. Its
// weight dwarfs attention's 1, so dragging the slider effectively pins the
// score; "clear" drops it and hands the session back to the real sources.
const MANUAL_SOURCE = "manual";
const MANUAL_WEIGHT = 8;

// Drives the world by hand until tracking, the session timer, and the agents
// exist. Friends toggle between running and stopped on their own.
export function SessionDevPanel() {
  const localTrainId = useWorld((s) => s.localTrainId);
  const score = useEfficiency((s) => s.score);
  const signals = useEfficiency((s) => s.signals);
  const manual = signals[MANUAL_SOURCE];
  const local = useWorld((s) => (s.localTrainId === null ? undefined : s.trains[s.localTrainId]));
  const trainCount = useWorld((s) => Object.keys(s.trains).length);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);
  const friendCounter = useRef<number>(0);

  useEffect(() => {
    return () => {
      for (const t of timers.current) clearInterval(t);
    };
  }, []);

  if (localTrainId === null || !local) return null;
  const w = useWorld.getState();

  const addFriend = () => {
    const id = `friend-${friendCounter.current++}`;
    const liveTrainCount = Object.keys(useWorld.getState().trains).length;
    w.addTrain({
      id,
      owner: {
        name: FRIEND_NAMES[(liveTrainCount - 1) % FRIEND_NAMES.length] ?? "Friend",
        spriteUrl: "/characters/bonbon.png",
      },
      phase: "running",
      efficiency: 0.3 + Math.random() * 0.6,
      lane: liveTrainCount,
    });
    const timer = setInterval(
      () => {
        const current = useWorld.getState().trains[id];
        if (!current) {
          clearInterval(timer);
          return;
        }
        w.setPhase(id, current.phase === "running" ? "stopped" : "running");
      },
      8000 + Math.random() * 7000,
    );
    timers.current.push(timer);
  };

  return (
    <div
      className={cn(
        "absolute top-4 right-4 flex w-56 flex-col gap-3",
        "rounded-lg border bg-background/90 p-4 text-sm shadow",
      )}
    >
      <div className="font-semibold">Dev: {local.owner.name}</div>
      <div className="flex gap-2">
        {PHASES.map((phase) => (
          <button
            key={phase}
            type="button"
            onClick={() => w.setPhase(localTrainId, phase)}
            className={
              local.phase === phase
                ? "rounded bg-primary px-2 py-1 text-primary-foreground"
                : "rounded border px-2 py-1"
            }
          >
            {phase}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1 border-t pt-2">
        <div className="flex items-baseline justify-between">
          <span className="font-semibold">score {Math.round(score)}</span>
          {manual && (
            <button
              type="button"
              className="rounded border px-2 text-xs"
              onClick={() => useEfficiency.getState().drop(MANUAL_SOURCE)}
            >
              clear override
            </button>
          )}
        </div>

        <label className="flex flex-col gap-1">
          manual {(manual?.value ?? local.efficiency).toFixed(2)}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={manual?.value ?? local.efficiency}
            onChange={(e) =>
              useEfficiency.getState().report(MANUAL_SOURCE, Number(e.target.value), {
                label: "Manual override",
                weight: MANUAL_WEIGHT,
              })
            }
          />
        </label>

        <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {Object.values(signals).map((signal) => (
            <li key={signal.source} className="flex justify-between gap-2">
              <span className="truncate">{signal.label}</span>
              <span className="font-mono">
                {signal.value.toFixed(2)} &times;{effectiveWeight(signal, Date.now()).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <button type="button" onClick={addFriend} className="rounded border px-2 py-1">
        add friend train ({trainCount - 1})
      </button>
    </div>
  );
}
