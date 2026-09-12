// Tool: decides whether a learner can move on from a station, given the
// scope and every question's outcome — never the source material, same
// minimal-context principle as grade-answer. This is a holistic judgment call
// (partial credit, which questions mattered more), not a fixed "all correct"
// or percentage rule. Flash tier; the harness decides whether to escalate.
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
});
export type EvaluateProgressInput = z.infer<typeof evaluateProgressInputSchema>;

export const evaluateProgressOutputSchema = z.object({
  passed: z.boolean(),
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

export const evaluateProgressToolSpec: ToolSpec<EvaluateProgressInput, EvaluateProgressOutput> = {
  name: "evaluate-progress",
  inputSchema: evaluateProgressInputSchema,
  outputSchema: evaluateProgressOutputSchema,
  confidenceThreshold: CONFIDENCE_THRESHOLD,
  prompt: (input) => [
    {
      kind: "text",
      text: `You are deciding whether a learner has understood this station well enough to move on. This station's scope: "${input.scope}"

Here is every question they answered at this station and how it was graded:
${formatResults(input.results)}

Use your judgment, not a fixed rule: weigh how central each question was to the scope, whether the mistakes suggest a real gap versus a minor slip, and the overall pattern — not just an average.

Respond with JSON only, matching exactly this shape: {"confidence": number between 0 and 1 (how sure you are of this call), "passed": boolean (can they move on?), "feedback": string (one or two sentences, addressed to the learner, explaining the decision)}.
confidence is for the conductor's internal quality check only; still include it.`,
    },
  ],
  fixture: () => ({
    passed: false,
    feedback:
      "Automatic review is unavailable right now — keep studying this station and try again shortly.",
  }),
};

export const evaluateProgressTool = defineTool(evaluateProgressToolSpec);
