import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { ChatOverlay } from "@/features/chat";
import { efficiencyFraction, reportAttention, useEfficiency } from "@/features/efficiency";
import { Gaze } from "@/features/gaze";
import { TrainWorld } from "@/features/scene";
import { useEfficiencyDrive } from "@/features/session";
import { useDepartureAnnouncer, useSpeechPlayer } from "@/features/speech";
import { useWorld } from "@/features/world";
import { SessionDevPanel } from "./session-dev-panel";

const LOCAL_TRAIN_ID = "local";

export function Session() {
  const localTrainId = useWorld((s) => s.localTrainId);
  const score = useEfficiency((s) => s.score);

  // Gaze reports attention, the quiz will report its own signal, and this
  // hands whatever they add up to on to the train.
  useEfficiencyDrive();
  // Conductors: play each utterance's clip and announce departures.
  useSpeechPlayer();
  useDepartureAnnouncer();

  useEffect(() => {
    if (localTrainId !== null) return;
    const w = useWorld.getState();
    w.addTrain({
      id: LOCAL_TRAIN_ID,
      owner: { name: "You", spriteUrl: "/characters/poku.png" },
      // Running from the moment you open a session: the score is what sets the
      // speed from here, and it starts wherever the score starts.
      phase: "running",
      efficiency: efficiencyFraction(),
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
      <div className="absolute bottom-4 left-4 rounded-lg bg-white/90 font-mono">
        <div className="px-4 pt-3 text-sm font-semibold">Focus {Math.round(score)}/100</div>
        <Gaze debug={dev} onFacing={reportAttention} />
      </div>
      <ChatOverlay />
    </div>
  );
}
