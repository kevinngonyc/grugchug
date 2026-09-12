import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { Gaze } from "@/features/gaze";
import { TrainWorld } from "@/features/scene";
import { useWorld } from "@/features/world";
import { SessionDevPanel } from "./session-dev-panel";

const LOCAL_TRAIN_ID = "local";

export function Session() {
  const localTrainId = useWorld((s) => s.localTrainId);

  useEffect(() => {
    if (localTrainId !== null) return;
    const w = useWorld.getState();
    w.addTrain({
      id: LOCAL_TRAIN_ID,
      owner: { name: "You", spriteUrl: "/characters/poku.png" },
      phase: "stopped",
      efficiency: 0.7,
      lane: 0,
    });
    w.setLocalTrainId(LOCAL_TRAIN_ID);
  }, [localTrainId]);

  const [params] = useSearchParams();
  const dev = params.has("dev");

  return (
    <div className="absolute inset-0">
      <TrainWorld />
      {dev ? <SessionDevPanel /> : null}
      <div className="absolute bottom-4 left-4 rounded-lg bg-white/90">
        <Gaze debug={dev} />
      </div>
    </div>
  );
}
