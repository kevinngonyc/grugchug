// Tool: writes the learner's feedback for a station they just finished. The
// verdict is not the model's call — the route decides `passed` from the mean
// score against PASS_THRESHOLD, the same number the web shows as "overall" —
// so the words can never contradict the score on screen. Given the scope and
// every question's outcome, never the source material, same minimal-context
// principle as grade-answer. Flash tier; the harness decides whether to
// escalate.
import { PASS_THRESHOLD } from "@grugchug/shared";
import { z } from "zod";
import { CONFIDENCE_THRESHOLD, defineTool, type ToolSpec } from "../harness";

const progressResultInputSchema = z.object({
  prompt: z.string().min(1),
  answerGiven: z.string(),
  score: z.number().min(0).max(1),
  feedback: z.string(),
});

export const evaluateProgressInputSchema = z.object({
  scope: z.string().min(1),
  results: z.array(progressResultInputSchema).min(1),
  passed: z.boolean(),
  meanScore: z.number().min(0).max(1),
});
export type EvaluateProgressInput = z.infer<typeof evaluateProgressInputSchema>;

export const evaluateProgressOutputSchema = z.object({
  feedback: z.string(),
});
export type EvaluateProgressOutput = z.infer<typeof evaluateProgressOutputSchema>;

function formatResults(results: EvaluateProgressInput["results"]): string {
  return results
    .map(
      (r, i) =>
        `${i + 1}. Question: ${r.prompt}\n   Answer given: ${r.answerGiven}\n   Score: ${r.score}\n   Grader feedback: ${r.feedback}`,
    )
    .join("\n");
}

function percent(fraction: number): number {
  return Math.round(fraction * 100);
}

export const evaluateProgressToolSpec: ToolSpec<EvaluateProgressInput, EvaluateProgressOutput> = {
  name: "evaluate-progress",
  inputSchema: evaluateProgressInputSchema,
  outputSchema: evaluateProgressOutputSchema,
  confidenceThreshold: CONFIDENCE_THRESHOLD,
  system:
    "You are the professor for this course, writing brief feedback to a learner who just finished a station's quiz. You are specific about what they got right and what to review, and encouraging without being vague. The pass or fail verdict is already decided by their score; you explain it and never contradict it. Respond with JSON only.",
  temperature: 0.3,
  prompt: (input) => [
    {
      kind: "text",
      text: `Write feedback for a learner who just finished this station's quiz. This station's scope: "${input.scope}"

Here is every question they answered at this station and how it was graded:
${formatResults(input.results)}

Their overall score is ${percent(input.meanScore)}% and the pass mark is ${percent(PASS_THRESHOLD)}%, so they have ${input.passed ? "passed and move on to the next station" : "not passed yet and will review this station before trying again"}.

In one or two sentences addressed to the learner, say what they did well and what to review ${input.passed ? "before the next station builds on it" : "before they retry"}. Name specific topics from the questions rather than giving generic advice.

Respond with JSON only, matching exactly this shape: {"confidence": number between 0 and 1 (how sure you are this feedback is accurate), "feedback": string}.
confidence is for the conductor's internal quality check only; still include it.`,
    },
  ],
  fixture: (input) => ({
    feedback: input.passed
      ? "You passed this station. Detailed feedback is unavailable right now."
      : "Not quite yet — review this station and try the questions again. Detailed feedback is unavailable right now.",
  }),
};

export const evaluateProgressTool = defineTool(evaluateProgressToolSpec);
