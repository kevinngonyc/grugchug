import { z } from "zod";

// A single gaze estimate. x and y are normalized to the viewport, 0..1.
export const gazeSampleSchema = z.object({
  sessionId: z.string(),
  t: z.number().nonnegative(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  onScreen: z.boolean(),
});

export type GazeSample = z.infer<typeof gazeSampleSchema>;
