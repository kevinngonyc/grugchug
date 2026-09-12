import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { ChatOverlay, readIdentity } from "@/features/chat";
import { ConductorOverlay } from "@/features/conductor";
import { efficiencyFraction } from "@/features/efficiency";
import { FocusBoard } from "@/features/leaderboard";
import { AvatarDialog, profileOwner, useAvatarPickerUi, useProfile } from "@/features/profile";
import { createVoiceAudio, TrainWorld } from "@/features/scene";
import { useEfficiencyDrive, useJourneyLink, usePartyTrains } from "@/features/session";
import { useSpeechPlayer } from "@/features/speech";
import { useWorld } from "@/features/world";
import { FocusHud } from "./focus-hud";
import { SessionDevPanel } from "./session-dev-panel";

const LOCAL_TRAIN_ID = "local";

export function Session() {
  const localTrainId = useWorld((s) => s.localTrainId);
  const user = useProfile((s) => s.user);
  const status = useProfile((s) => s.status);
  const load = useProfile((s) => s.load);

  // Gaze reports attention, the quiz will report its own signal, and this
  // hands whatever they add up to on to the train — and to the room.
  useEfficiencyDrive();
  // Conductors: play each utterance's clip.
  useSpeechPlayer(createVoiceAudio);
  // Everyone in your chat room gets a train in the lane beside yours.
  usePartyTrains();
  // The room hears where you are on your route.
  useJourneyLink();

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
      // Waiting at the platform until Start studying; the study session drives
      // the phase from here.
      phase: "stopped",
      efficiency: efficiencyFraction(),
      lane: 0,
    });
    w.setLocalTrainId(LOCAL_TRAIN_ID);
  }, [localTrainId, status, user]);

  // Apply saved avatar changes to the passenger already riding in the scene.
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
  // See FocusHud: a switch for telling the scene's cost apart from the
  // tracker's when the session feels slow.
  const gaze = !params.has("nogaze");

  return (
    <div className="absolute inset-0">
      <TrainWorld debug={dev} />
      {dev ? <SessionDevPanel /> : null}
      <FocusBoard onSelectCharacter={() => useAvatarPickerUi.getState().setOpen(true)} />
      <FocusHud debug={dev} gaze={gaze} />
      <ChatOverlay />
      <ConductorOverlay />
      <AvatarDialog />
    </div>
  );
}
