// Study session state. Starts and stops a session, collects samples from the
// gaze and typing features, and sends them to the API. It is also what drives
// the world: the study efficiency score becomes the local train's efficiency,
// and so its speed.
export type { Session } from "@grugchug/shared";
export {
  driveEfficiencyOnce,
  EFFICIENCY_DRIVE_INTERVAL_MS,
  useEfficiencyDrive,
} from "./use-efficiency-drive";
