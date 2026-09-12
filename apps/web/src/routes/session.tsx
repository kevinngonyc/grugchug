import { useEffect } from "react";
import { TrainWorld } from "@/features/scene";
import { useWorld } from "@/features/world";

const LOCAL_TRAIN_ID = "local";

export function Session() {
  const localTrainId = useWorld((s) => s.localTrainId);

  useEffect(() => {
    if (localTrainId !== null) return;
    const w = useWorld.getState();
    w.addTrain({
      id: LOCAL_TRAIN_ID,
      owner: { name: "You", spriteUrl: "/characters/default.svg" },
      phase: "stopped",
      efficiency: 0.7,
      lane: 0,
    });
    w.setLocalTrainId(LOCAL_TRAIN_ID);
  }, [localTrainId]);

  return (
    <div className="absolute inset-0">
      <TrainWorld />
    </div>
  );
}
