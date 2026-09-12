import { z } from "zod";

// What a train is doing. Drivers set this; the scene animates toward it.
export const trainPhaseSchema = z.enum(["running", "stopped", "finished"]);
export type TrainPhase = z.infer<typeof trainPhaseSchema>;

export const trainOwnerSchema = z.object({
  name: z.string().min(1),
  spriteUrl: z.string(),
});
export type TrainOwner = z.infer<typeof trainOwnerSchema>;

// One train in the world. `efficiency` is the 0..1 study score that affects
// the train; `lane` is which track it runs on, 0 being closest to the camera.
export const trainStateSchema = z.object({
  id: z.string().min(1),
  owner: trainOwnerSchema,
  phase: trainPhaseSchema,
  efficiency: z.number().min(0).max(1),
  lane: z.number().int().nonnegative(),
});
export type TrainState = z.infer<typeof trainStateSchema>;

// The whole world from one client's point of view. Future multiplayer wire format.
export const worldSnapshotSchema = z.object({
  trains: z.record(z.string(), trainStateSchema),
  localTrainId: z.string().nullable(),
});
export type WorldSnapshot = z.infer<typeof worldSnapshotSchema>;
