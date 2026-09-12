// Tool: writes one station's quiz from its scope and the study material.
// Always 8 questions — 4 single-choice, 2 select-all-that-apply, 2
// short-answer — matching the shape the fixture and the frontend were built
// against. mcq needs correctIndex; multi needs correctIndices (at least two,
// not every choice); short needs both a rubric and a referenceAnswer for
// grade-answer.ts to use later. Flash tier; the harness decides whether to
// escalate.
import { MAX_MATERIALS, materialSchema, questionSchema } from "@grugchug/shared";
import { z } from "zod";
import { fixtureRoutePlan } from "../fixtures";
import { CONFIDENCE_THRESHOLD, defineTool, type ToolSpec } from "../harness";
import { materialParts } from "../material-parts";

export const generateQuestionsInputSchema = z.object({
  scope: z.string().min(1),
  materials: z.array(materialSchema).min(1).max(MAX_MATERIALS),
});
export type GenerateQuestionsInput = z.infer<typeof generateQuestionsInputSchema>;

export const generateQuestionsOutputSchema = z
  .object({ questions: z.array(questionSchema).length(8) })
  .refine(
    (v) =>
      v.questions.filter((q) => q.type === "mcq").length === 4 &&
      v.questions.filter((q) => q.type === "multi").length === 2 &&
      v.questions.filter((q) => q.type === "short").length === 2,
    { message: "must be exactly 4 mcq, 2 multi-select, and 2 short-answer questions" },
  );
export type GenerateQuestionsOutput = z.infer<typeof generateQuestionsOutputSchema>;

export const generateQuestionsToolSpec: ToolSpec<GenerateQuestionsInput, GenerateQuestionsOutput> =
  {
    name: "generate-questions",
    inputSchema: generateQuestionsInputSchema,
    outputSchema: generateQuestionsOutputSchema,
    confidenceThreshold: CONFIDENCE_THRESHOLD,
    system:
      "You are a university professor writing a fair exam on one section of your course. Your questions test understanding of the attached material, not trivia or trick wording. Every correct answer is supported by the material, and every wrong choice is plausible yet clearly wrong to someone who studied it. Short-answer rubrics are explicit enough for a grader who never sees the material. Respond with JSON only.",
    temperature: 0.7,
    // Material first: every station of a route sends the same files, so the
    // parallel per-station calls share one long prefix a provider can cache.
    prompt: (input) => [
      ...materialParts(input.materials),
      {
        kind: "text",
        text: `Write the quiz for one station of the study route. This station's scope: "${input.scope}"
Using only the attached material, write exactly 8 questions covering this scope, in three different styles so the quiz isn't monotonous: 4 single-choice, 2 select-all-that-apply, and 2 short-answer.
Respond with JSON only, matching exactly this shape:
{"confidence": number (0 to 1, how sure you are these questions are well-grounded in the attached material),
 "questions": [
  {"id": string (unique within this list), "type": "mcq", "prompt": string, "choices": string[] (2 to 6 options), "correctIndex": number (0-based index into choices)},
  ... 4 total "mcq" entries ...,
  {"id": string, "type": "multi", "prompt": string (should make clear more than one choice may be correct, e.g. "select all that apply"), "choices": string[] (3 to 6 options), "correctIndices": number[] (0-based indices into choices; at least 2, but never every choice)},
  ... 2 total "multi" entries ...,
  {"id": string, "type": "short", "prompt": string, "rubric": string (what a correct answer must contain, for a grader who never sees the source material), "referenceAnswer": string (one example of a correct answer)},
  ... 2 total "short" entries ...
]}
Order does not matter, but the list must contain exactly 4 "mcq" entries, exactly 2 "multi" entries, and exactly 2 "short" entries.
confidence is for the conductor's internal quality check only; still include it.`,
      },
    ],
    fixture: () => {
      const station = fixtureRoutePlan.stations[0];
      if (!station) throw new Error("fixtureRoutePlan has no stations");
      return { questions: station.questions };
    },
  };

export const generateQuestionsTool = defineTool(generateQuestionsToolSpec);
