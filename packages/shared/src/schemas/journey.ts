import { z } from "zod";

// Where a rider is on their route, as the room sees it. Mirrors the conductor's
// study-session modes without naming them: idle has no plan or has not started;
// studying is the timer running; at-station, answering and on-break are the
// three things you do at a platform; finished is the terminus.
export const journeyStateSchema = z.enum([
  "idle",
  "studying",
  "at-station",
  "answering",
  "on-break",
  "finished",
]);
export type JourneyState = z.infer<typeof journeyStateSchema>;

// `station` is 1-based for display ("Station 2 of 6") and null when there is
// no plan.
export const journeySchema = z.object({
  state: journeyStateSchema,
  station: z
    .object({ index: z.number().int().positive(), total: z.number().int().positive() })
    .nullable(),
});
export type Journey = z.infer<typeof journeySchema>;
