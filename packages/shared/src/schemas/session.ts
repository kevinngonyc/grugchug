import { z } from "zod";

// One sitting at the desk: from pressing start to pressing stop.
export const sessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
});

export type Session = z.infer<typeof sessionSchema>;
