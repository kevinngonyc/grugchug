// Study session state. Starts and stops a session, collects samples from the
// gaze and typing features, and sends them to the API. It is also the only
// writer into the world: the study efficiency score becomes the local train's
// efficiency, and so its speed, and the chat roster becomes the trains running
// alongside it.
export type { Session } from "@grugchug/shared";
export {
  arrivals,
  MAX_PARTY_TRAINS,
  PARTY_TRAIN_PREFIX,
  partyTrainId,
  partyTrains,
  spriteForUserId,
} from "./party";
export {
  driveEfficiencyOnce,
  EFFICIENCY_DRIVE_INTERVAL_MS,
  useEfficiencyDrive,
} from "./use-efficiency-drive";
export { usePartyTrains } from "./use-party-trains";
