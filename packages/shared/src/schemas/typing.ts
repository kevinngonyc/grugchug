import { z } from "zod";

// A single keystroke event. No key contents are stored, only timing and
// whether it was a correction, which is enough for speed and accuracy.
export const typingSampleSchema = z.object({
  sessionId: z.string(),
  t: z.number().nonnegative(),
  isCorrection: z.boolean(),
});

export type TypingSample = z.infer<typeof typingSampleSchema>;
