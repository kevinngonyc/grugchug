// Tool: breaks study material into a route of stations (no questions yet —
// generate-questions.ts fills those in per station, once plan-route has
// decided what each station covers). Flash tier; the harness decides
// whether a retry or an escalation to pro is needed.
import { MAX_STATIONS, materialSchema } from "@grugchug/shared";
import { z } from "zod";
import { fixtureRoutePlan } from "../fixtures";
import { defineTool, type ToolSpec } from "../harness";
import { materialParts } from "../material-parts";

export const planRouteInputSchema = z.object({
  material: materialSchema,
  availableMinutes: z.number().int().min(1).max(600),
});
export type PlanRouteInput = z.infer<typeof planRouteInputSchema>;

const stationSkeletonSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().nonnegative(),
  title: z.string().min(1),
  scope: z.string().min(1),
  estimatedMinutes: z.number().positive(),
});
export type StationSkeleton = z.infer<typeof stationSkeletonSchema>;

export const planRouteOutputSchema = z.object({
  stations: z.array(stationSkeletonSchema).min(1).max(MAX_STATIONS),
});
export type PlanRouteOutput = z.infer<typeof planRouteOutputSchema>;

export const planRouteToolSpec: ToolSpec<PlanRouteInput, PlanRouteOutput> = {
  name: "plan-route",
  inputSchema: planRouteInputSchema,
  outputSchema: planRouteOutputSchema,
  prompt: (input) => [
    {
      kind: "text",
      text: `You are building a study route through the attached material for a learner with about ${input.availableMinutes} minutes.
Break the material into at most ${MAX_STATIONS} stations, each covering a distinct, contiguous chunk of the material in a sensible learning order. Never output more than ${MAX_STATIONS} stations.
Respond with JSON only, matching exactly this shape:
{"stations": [{"id": string, "index": number (0-based, in route order), "title": string, "scope": string (a precise description of what this station covers — detailed enough that someone could write quiz questions from it alone, without seeing the source material again), "estimatedMinutes": number}]}
The sum of estimatedMinutes should roughly match the learner's available time.`,
    },
    ...materialParts(input.material),
  ],
  fixture: () => ({
    stations: fixtureRoutePlan.stations.map(({ id, index, title, scope, estimatedMinutes }) => ({
      id,
      index,
      title,
      scope,
      estimatedMinutes,
    })),
  }),
};

export const planRouteTool = defineTool(planRouteToolSpec);
