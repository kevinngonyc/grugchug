// Tool: writes one station's quiz from its scope and the study material.
// Always 3 mcq + 1 short answer, matching the shape the fixture and the
// frontend were built against. mcq needs correctIndex; short needs both a
// rubric and a referenceAnswer for grade-answer.ts to use later. Flash
// tier; the harness decides whether to escalate.
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
  .object({ questions: z.array(questionSchema).length(4) })
  .refine(
    (v) =>
      v.questions.filter((q) => q.type === "mcq").length === 3 &&
      v.questions.filter((q) => q.type === "short").length === 1,
    { message: "must be exactly 3 mcq questions and 1 short-answer question" },
  );
export type GenerateQuestionsOutput = z.infer<typeof generateQuestionsOutputSchema>;

export const generateQuestionsToolSpec: ToolSpec<GenerateQuestionsInput, GenerateQuestionsOutput> =
  {
    name: "generate-questions",
    inputSchema: generateQuestionsInputSchema,
    outputSchema: generateQuestionsOutputSchema,
    confidenceThreshold: CONFIDENCE_THRESHOLD,
    prompt: (input) => [
      {
        kind: "text",
        text: `You are writing quiz questions for one station of a study route. This station's scope: "${input.scope}"
Using only the attached material, write exactly 4 questions covering this scope: 3 multiple-choice and 1 short-answer.
Respond with JSON only, matching exactly this shape:
{"confidence": number (0 to 1, how sure you are these questions are well-grounded in the attached material),
 "questions": [
  {"id": string (unique within this list), "type": "mcq", "prompt": string, "choices": string[] (2 to 6 options), "correctIndex": number (0-based index into choices)},
  {"id": string, "type": "mcq", ...same shape...},
  {"id": string, "type": "mcq", ...same shape...},
  {"id": string, "type": "short", "prompt": string, "rubric": string (what a correct answer must contain, for a grader who never sees the source material), "referenceAnswer": string (one example of a correct answer)}
]}
Order does not matter, but the list must contain exactly 3 "mcq" entries and exactly 1 "short" entry.
confidence is for the conductor's internal quality check only; still include it.`,
      },
      ...materialParts(input.materials),
    ],
    fixture: () => {
      const station = fixtureRoutePlan.stations[0];
      if (!station) throw new Error("fixtureRoutePlan has no stations");
      return { questions: station.questions };
    },
  };

export const generateQuestionsTool = defineTool(generateQuestionsToolSpec);
