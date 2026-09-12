// Tool: the teaching assistant. Answers a learner's question mid-study from
// the course material itself when the route has it stored, with the current
// station's scope as the focus and the last few exchanges for follow-ups.
// Plans built before materials were stored only have the scope. Flash tier.
import { askTurnSchema, MAX_ASK_HISTORY, MAX_MATERIALS, materialSchema } from "@grugchug/shared";
import { z } from "zod";
import { defineTool, type ToolSpec } from "../harness";
import { materialParts } from "../material-parts";

export const askConductorInputSchema = z.object({
  scope: z.string().min(1),
  question: z.string().min(1),
  history: z.array(askTurnSchema).max(MAX_ASK_HISTORY).optional(),
  materials: z.array(materialSchema).min(1).max(MAX_MATERIALS).optional(),
});
export type AskConductorInput = z.infer<typeof askConductorInputSchema>;

export const askConductorOutputSchema = z.object({ answer: z.string() });
export type AskConductorOutput = z.infer<typeof askConductorOutputSchema>;

function transcript(history: AskConductorInput["history"]): string {
  if (!history || history.length === 0) return "";
  const turns = history.map((turn) => `Learner: ${turn.question}\nYou: ${turn.answer}`);
  return `\n\nThe conversation so far, oldest first:\n${turns.join("\n\n")}`;
}

export const askConductorToolSpec: ToolSpec<AskConductorInput, AskConductorOutput> = {
  name: "ask-conductor",
  inputSchema: askConductorInputSchema,
  outputSchema: askConductorOutputSchema,
  // No two questions are alike and the history changes every turn, so a
  // cache entry could never hit — and its key would hash every megabyte of
  // the attached material on each ask.
  cache: false,
  system:
    "You are the teaching assistant for this course, helping a learner while they work through a study route. You explain clearly and patiently, use examples when they help, and never make up facts the course material does not support. Respond with JSON only.",
  temperature: 0.4,
  prompt: (input) => [
    ...(input.materials ? materialParts(input.materials) : []),
    {
      kind: "text",
      text: `Help the learner with their question. The station they are on covers: "${input.scope}"
${
  input.materials
    ? "The course material is attached above. Answer from it: treat the station as your focus, but draw on any part of the material that helps."
    : "You have the station's description, not the material itself. Answer from it and from general knowledge that is consistent with it."
}

Think about the question against that material before answering: even if it isn't phrased in the material's own terms, look for a real connection (an example of a concept, a term from a different angle, something implied but not spelled out) and answer using that connection if you find one. Only say a question is out of scope after genuinely failing to find one, and even then be specific about what the material covers that is closest to it and why, rather than a bare "not covered."

Answer directly and concisely. Use the conversation so far to understand follow-ups like "and the second one?".${transcript(input.history)}

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
