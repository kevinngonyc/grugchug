import { z } from "zod";

// One run through a route: from Start studying to complete or quit. Recorded
// as it happens by the web app; the plan is not copied, only referenced.
export const studyOutcomeSchema = z.enum(["completed", "quit"]);
export type StudyOutcome = z.infer<typeof studyOutcomeSchema>;

export const studySessionSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  planId: z.string().min(1),
  stationTotal: z.number().int().positive(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  outcome: studyOutcomeSchema.nullable(),
});
export type StudySession = z.infer<typeof studySessionSchema>;

// One attempt at one station's questions. A station may be attempted more
// than once; "passed" for a session means the latest attempt passed.
export const stationResultSchema = z.object({
  sessionId: z.string().min(1),
  stationIndex: z.number().int().nonnegative(),
  stationId: z.string().min(1),
  passed: z.boolean(),
  meanScore: z.number().min(0).max(1),
  recordedAt: z.iso.datetime(),
});
export type StationResult = z.infer<typeof stationResultSchema>;

export const studySessionSummarySchema = studySessionSchema.extend({
  stationsPassed: z.number().int().nonnegative(),
});
export type StudySessionSummary = z.infer<typeof studySessionSummarySchema>;

// POST /api/study-sessions
export const startStudySessionRequestSchema = z.object({
  userId: z.string().min(1),
  planId: z.string().min(1),
  stationTotal: z.number().int().positive(),
});
export type StartStudySessionRequest = z.infer<typeof startStudySessionRequestSchema>;

// POST /api/study-sessions/:id/stations
export const stationResultRequestSchema = stationResultSchema.pick({
  stationIndex: true,
  stationId: true,
  passed: true,
  meanScore: true,
});
export type StationResultRequest = z.infer<typeof stationResultRequestSchema>;

// POST /api/study-sessions/:id/end
export const endStudySessionRequestSchema = z.object({ outcome: studyOutcomeSchema });
export type EndStudySessionRequest = z.infer<typeof endStudySessionRequestSchema>;
