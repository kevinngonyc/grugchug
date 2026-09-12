import { useEffect, useRef } from "react";
import { type TrainPhase, useWorld } from "@/features/world";

const FRIEND_NAMES = ["Ada", "Grace", "Linus", "Margaret", "Dennis"];
const PHASES: TrainPhase[] = ["running", "stopped", "finished"];

// Drives the world by hand until tracking, the session timer, and the agents
// exist. Friends toggle between running and stopped on their own.
export function SessionDevPanel() {
  const localTrainId = useWorld((s) => s.localTrainId);
  const local = useWorld((s) => (s.localTrainId === null ? undefined : s.trains[s.localTrainId]));
  const trainCount = useWorld((s) => Object.keys(s.trains).length);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);

  useEffect(() => {
    return () => {
      for (const t of timers.current) clearInterval(t);
    };
  }, []);

  if (localTrainId === null || !local) return null;
  const w = useWorld.getState();

  const addFriend = () => {
    const id = `friend-${trainCount}`;
    w.addTrain({
      id,
      owner: {
        name: FRIEND_NAMES[trainCount % FRIEND_NAMES.length] ?? "Friend",
        spriteUrl: "/characters/default.svg",
      },
      phase: "running",
      efficiency: 0.3 + Math.random() * 0.6,
      lane: trainCount,
    });
    const timer = setInterval(
      () => {
        const current = useWorld.getState().trains[id];
        if (!current) return clearInterval(timer);
        w.setPhase(id, current.phase === "running" ? "stopped" : "running");
      },
      8000 + Math.random() * 7000,
    );
    timers.current.push(timer);
  };

  return (
    <div className="absolute top-4 right-4 flex w-56 flex-col gap-3 rounded-lg border bg-background/90 p-4 text-sm shadow">
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
      <label className="flex flex-col gap-1">
        efficiency {local.efficiency.toFixed(2)}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={local.efficiency}
          onChange={(e) => w.setEfficiency(localTrainId, Number(e.target.value))}
        />
      </label>
      <button type="button" onClick={addFriend} className="rounded border px-2 py-1">
        add friend train ({trainCount - 1})
      </button>
    </div>
  );
}
