import { z } from "zod";

// Hard cap on stations per route. The route planner prompt repeats this number.
export const MAX_STATIONS = 6;

// A multiple-choice question as stored. correctIndex points into choices.
const mcqQuestionBase = z.object({
  id: z.string(),
  type: z.literal("mcq"),
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2).max(6),
  correctIndex: z.number().int().nonnegative(),
});

// A short-answer question as stored. rubric and referenceAnswer drive grading.
const shortQuestionBase = z.object({
  id: z.string(),
  type: z.literal("short"),
  prompt: z.string().min(1),
  rubric: z.string().min(1),
  referenceAnswer: z.string().min(1),
});

// A question with its answer key. Never sent to the browser: see publicQuestionSchema.
export const questionSchema = z
  .discriminatedUnion("type", [mcqQuestionBase, shortQuestionBase])
  .refine((q) => q.type !== "mcq" || q.correctIndex < q.choices.length, {
    message: "correctIndex must point into choices",
    path: ["correctIndex"],
  });

export type Question = z.infer<typeof questionSchema>;

// A question as the browser sees it: the answer key is stripped.
export const publicQuestionSchema = z.discriminatedUnion("type", [
  mcqQuestionBase.omit({ correctIndex: true }),
  shortQuestionBase.omit({ rubric: true, referenceAnswer: true }),
]);

export type PublicQuestion = z.infer<typeof publicQuestionSchema>;

// One stop on the route. scope says what material the station covers.
export const stationSchema = z.object({
  id: z.string(),
  index: z.number().int().nonnegative(),
  title: z.string().min(1),
  scope: z.string().min(1),
  estimatedMinutes: z.number().positive(),
  questions: z.array(questionSchema).min(1),
});

export type Station = z.infer<typeof stationSchema>;

// A station as the browser sees it. Parsing through this drops every answer key.
export const publicStationSchema = stationSchema.extend({
  questions: z.array(publicQuestionSchema).min(1),
});

export type PublicStation = z.infer<typeof publicStationSchema>;

// A whole route built from one piece of study material. This is what MongoDB stores.
export const routePlanSchema = z.object({
  id: z.string(),
  userId: z.string(),
  materialHash: z.string(),
  totalEstimatedMinutes: z.number().positive(),
  stations: z.array(stationSchema).min(1).max(MAX_STATIONS),
});

export type RoutePlan = z.infer<typeof routePlanSchema>;

// A route as the browser sees it.
export const publicRoutePlanSchema = routePlanSchema.extend({
  stations: z.array(publicStationSchema).min(1).max(MAX_STATIONS),
});

export type PublicRoutePlan = z.infer<typeof publicRoutePlanSchema>;

// Uploaded study material: pasted text, or a PDF as base64 (about 15 MB max).
export const materialSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().min(1).max(500_000) }),
  z.object({ kind: z.literal("pdf"), base64: z.base64().min(1).max(20_000_000) }),
]);

export type Material = z.infer<typeof materialSchema>;

// Body of POST /api/conductor/plans.
export const createPlanRequestSchema = z.object({
  userId: z.string().min(1),
  availableMinutes: z.number().int().min(1).max(600),
  material: materialSchema,
});

export type CreatePlanRequest = z.infer<typeof createPlanRequestSchema>;

// A learner's answer to one question.
export const answerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("mcq"), choiceIndex: z.number().int().nonnegative() }),
  z.object({ type: z.literal("short"), text: z.string().max(5000) }),
]);

export type Answer = z.infer<typeof answerSchema>;

// Body of POST /api/conductor/stations/:stationId/answer.
export const answerSubmissionSchema = z.object({
  planId: z.string().min(1),
  questionId: z.string().min(1),
  answer: answerSchema,
});

export type AnswerSubmission = z.infer<typeof answerSubmissionSchema>;

// Grading outcome for one question. score is 0..1.
export const answerResultSchema = z.object({
  questionId: z.string(),
  score: z.number().min(0).max(1),
  passed: z.boolean(),
  feedback: z.string(),
});

export type AnswerResult = z.infer<typeof answerResultSchema>;

// Body of POST /api/conductor/ask: a question asked mid-study.
export const askRequestSchema = z.object({
  planId: z.string().min(1),
  stationId: z.string().min(1).optional(),
  question: z.string().min(1).max(2000),
});

export type AskRequest = z.infer<typeof askRequestSchema>;

// Reply to POST /api/conductor/ask.
export const askResponseSchema = z.object({
  answer: z.string(),
});

export type AskResponse = z.infer<typeof askResponseSchema>;

// Why the caller wants a timer: the initial stretch at a fresh station, more
// time on the station they're already at, or a break between stretches.
export const timerReasonSchema = z.enum(["study", "keep-studying", "break"]);

export type TimerReason = z.infer<typeof timerReasonSchema>;

// Body of POST /api/conductor/timer. stationId resolves the scope server-side
// (like askRequestSchema) rather than trusting a client-supplied scope
// string; omit it for a break, which doesn't need station context.
export const setTimerRequestSchema = z.object({
  planId: z.string().min(1),
  stationId: z.string().min(1).optional(),
  reason: timerReasonSchema,
  previousMinutes: z.number().positive().optional(),
});

export type SetTimerRequest = z.infer<typeof setTimerRequestSchema>;

// Reply to POST /api/conductor/timer. minutes is capped well under a single
// sitting so a bad response can't leave a learner waiting for hours.
export const setTimerResponseSchema = z.object({
  minutes: z.number().positive().max(180),
  message: z.string(),
});

export type SetTimerResponse = z.infer<typeof setTimerResponseSchema>;

// One question's outcome, summarized for evaluate-progress. Never the source
// material — same minimal-context principle as grade-answer.
export const progressResultSchema = z.object({
  questionId: z.string().min(1),
  prompt: z.string().min(1),
  answerGiven: z.string(),
  score: z.number().min(0).max(1),
  feedback: z.string(),
});

export type ProgressResult = z.infer<typeof progressResultSchema>;

// Body of POST /api/conductor/stations/:stationId/evaluate.
export const evaluateProgressRequestSchema = z.object({
  planId: z.string().min(1),
  results: z.array(progressResultSchema).min(1),
});

export type EvaluateProgressRequest = z.infer<typeof evaluateProgressRequestSchema>;

// Reply to POST /api/conductor/stations/:stationId/evaluate: can the learner
// move on to the next station?
export const evaluateProgressResponseSchema = z.object({
  passed: z.boolean(),
  feedback: z.string(),
});

export type EvaluateProgressResponse = z.infer<typeof evaluateProgressResponseSchema>;
