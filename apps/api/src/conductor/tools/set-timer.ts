// Tool: decides how long the next stretch should be — the initial study
// period at a fresh station, more time on the station the learner is already
// at, or a break between stretches. Flash tier; the harness decides whether
// to escalate.
import { timerReasonSchema } from "@grugchug/shared";
import { z } from "zod";
import { CONFIDENCE_THRESHOLD, defineTool, type ToolSpec } from "../harness";

export const setTimerInputSchema = z.object({
  reason: timerReasonSchema,
  scope: z.string().min(1).optional(),
  previousMinutes: z.number().positive().optional(),
});
export type SetTimerInput = z.infer<typeof setTimerInputSchema>;

export const setTimerOutputSchema = z.object({
  minutes: z.number().positive().max(180),
  message: z.string(),
});
export type SetTimerOutput = z.infer<typeof setTimerOutputSchema>;

function describeReason(input: SetTimerInput): string {
  switch (input.reason) {
    case "study":
      return `The learner is about to start studying${input.scope ? ` this: "${input.scope}"` : ""}. Suggest a focused study stretch, typically 5 to 25 minutes depending on how much the scope covers.`;
    case "keep-studying":
      return `The learner chose to keep studying the same material${input.scope ? ` ("${input.scope}")` : ""} instead of answering questions yet. Suggest another stretch.`;
    case "break":
      return `The learner wants a break${input.previousMinutes ? ` after studying for about ${input.previousMinutes} minutes` : ""}. Suggest a break long enough to actually rest without losing momentum — longer after a longer stretch, but rarely more than 20 minutes.`;
  }
}

export const setTimerToolSpec: ToolSpec<SetTimerInput, SetTimerOutput> = {
  name: "set-timer",
  inputSchema: setTimerInputSchema,
  outputSchema: setTimerOutputSchema,
  confidenceThreshold: CONFIDENCE_THRESHOLD,
  prompt: (input) => [
    {
      kind: "text",
      text: `You are a study conductor deciding how long the next timer should run.
${describeReason(input)}

Respond with JSON only, matching exactly this shape: {"confidence": number between 0 and 1 (how sure you are this duration is reasonable), "minutes": number (the timer length, at most 180), "message": string (one short, encouraging sentence telling the learner what's about to happen)}.
confidence is for the conductor's internal quality check only; still include it.`,
    },
  ],
  fixture: (input) => ({
    minutes: input.reason === "break" ? 10 : 15,
    message: "Starting a timer — the connection to the AI conductor is unavailable right now.",
  }),
};

export const setTimerTool = defineTool(setTimerToolSpec);
