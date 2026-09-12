import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { ChatOverlay, readIdentity } from "@/features/chat";
import { efficiencyFraction, reportAttention, useEfficiency } from "@/features/efficiency";
import { Gaze } from "@/features/gaze";
import { profileOwner, useProfile } from "@/features/profile";
import { createVoiceAudio, TrainWorld } from "@/features/scene";
import { useEfficiencyDrive, usePartyTrains } from "@/features/session";
import { useDepartureAnnouncer, useSpeechPlayer } from "@/features/speech";
import { useWorld } from "@/features/world";
import { SessionDevPanel } from "./session-dev-panel";

const LOCAL_TRAIN_ID = "local";

export function Session() {
  const localTrainId = useWorld((s) => s.localTrainId);
  const score = useEfficiency((s) => s.score);
  const user = useProfile((s) => s.user);
  const status = useProfile((s) => s.status);
  const load = useProfile((s) => s.load);

  // Gaze reports attention, the quiz will report its own signal, and this
  // hands whatever they add up to on to the train — and to the room.
  useEfficiencyDrive();
  // Conductors: play each utterance's clip and announce departures.
  useSpeechPlayer(createVoiceAudio);
  useDepartureAnnouncer();
  // Everyone in your chat room gets a train in the lane beside yours.
  usePartyTrains();

  useEffect(() => {
    void load();
  }, [load]);

  // The local train waits for the profile so it boards with the right
  // passenger. An unreachable API rides with the default rather than blocking.
  useEffect(() => {
    if (localTrainId !== null) return;
    if (status !== "ready" && status !== "error") return;
    const w = useWorld.getState();
    // StrictMode runs mount effects twice in dev; recheck the live store.
    if (w.localTrainId !== null) return;
    w.addTrain({
      id: LOCAL_TRAIN_ID,
      owner: profileOwner(user),
      // Running from the moment you open a session: the score is what sets the
      // speed from here, and it starts wherever the score starts.
      phase: "running",
      efficiency: efficiencyFraction(),
      lane: 0,
    });
    w.setLocalTrainId(LOCAL_TRAIN_ID);
  }, [localTrainId, status, user]);

  // The world store outlives route changes, so an avatar picked in Settings
  // has to be pushed onto a train that already exists.
  useEffect(() => {
    if (localTrainId === null || !user) return;
    const owner = profileOwner(user);
    useWorld.getState().setOwner(localTrainId, {
      ...owner,
      name: readIdentity()?.displayName ?? owner.name,
    });
  }, [localTrainId, user]);

  const [params] = useSearchParams();
  const dev = params.has("dev");

  return (
    <div className="absolute inset-0">
      <TrainWorld />
      {dev ? <SessionDevPanel /> : null}
      <div className="absolute bottom-4 left-4 z-10 rounded-lg bg-white/90 font-mono">
        <div className="px-4 pt-3 text-sm font-semibold">Focus {Math.round(score)}/100</div>
        <Gaze debug={dev} onFacing={reportAttention} />
      </div>
      <ChatOverlay />
    </div>
  );
}
