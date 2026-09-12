// Tool: answers a learner's question mid-study, using the current station's
// scope as context (not the full material — the scope is meant to be a
// self-contained description of what the station covers). Flash tier.
import { z } from "zod";
import { defineTool, type ToolSpec } from "../harness";

export const askConductorInputSchema = z.object({
  scope: z.string().min(1),
  question: z.string().min(1),
});
export type AskConductorInput = z.infer<typeof askConductorInputSchema>;

export const askConductorOutputSchema = z.object({ answer: z.string() });
export type AskConductorOutput = z.infer<typeof askConductorOutputSchema>;

export const askConductorToolSpec: ToolSpec<AskConductorInput, AskConductorOutput> = {
  name: "ask-conductor",
  inputSchema: askConductorInputSchema,
  outputSchema: askConductorOutputSchema,
  prompt: (input) => [
    {
      kind: "text",
      text: `You are a study conductor helping a learner while they work through one station of a study route. This station's scope: "${input.scope}"
Answer the learner's question directly and concisely using only that scope as context. If the question falls outside it, say so and suggest what to check instead.

Learner's question: ${input.question}

Respond with JSON only, matching exactly this shape: {"answer": string}.`,
    },
  ],
  fixture: () => ({
    answer:
      "The conductor can't reach an AI helper right now — try rereading this station's material, or ask again in a moment.",
  }),
};

export const askConductorTool = defineTool(askConductorToolSpec);
