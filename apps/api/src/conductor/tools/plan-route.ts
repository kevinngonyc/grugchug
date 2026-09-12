// Tool: breaks study material into a route of stations (no questions yet —
// generate-questions.ts fills those in per station, once plan-route has
// decided what each station covers). Flash tier; the harness decides
// whether a retry or an escalation to pro is needed.
import { MAX_MATERIALS, MAX_STATIONS, materialSchema } from "@grugchug/shared";
import { z } from "zod";
import { fixtureRoutePlan } from "../fixtures";
import { defineTool, type ToolSpec } from "../harness";
import { materialParts } from "../material-parts";

export const planRouteInputSchema = z.object({
  // Every file the learner uploaded: one route covers the whole set, so a
  // station may well span two of them.
  materials: z.array(materialSchema).min(1).max(MAX_MATERIALS),
  // Timing is the LLM's call, not the learner's — this is only ever set by
  // an internal caller that already knows a target (none exist today). The
  // web upload form no longer asks for it.
  availableMinutes: z.number().int().min(1).max(600).optional(),
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
  system:
    "You are an experienced curriculum designer. You turn a learner's study materials into a route of study stations: distinct, contiguous chunks of the material in a sensible learning order, each described precisely enough that a question writer who never sees the source could quiz on it. Stay strictly within what the materials cover. Respond with JSON only.",
  temperature: 0.3,
  prompt: (input) => [
    {
      kind: "text",
      text: `Build a study route through the ${input.materials.length} attached ${input.materials.length === 1 ? "material" : "materials, which the learner is studying as one body of work"}${input.availableMinutes ? ` for a learner with about ${input.availableMinutes} minutes` : ""}.
Break the material into at most ${MAX_STATIONS} stations, each covering a distinct, contiguous chunk of the material in a sensible learning order. Never output more than ${MAX_STATIONS} stations. Size each station's estimatedMinutes to how much it actually covers — dense or unfamiliar material earns more time, a light recap earns less.
Respond with JSON only, matching exactly this shape:
{"stations": [{"id": string, "index": number (0-based, in route order), "title": string, "scope": string (a precise description of what this station covers — detailed enough that someone could write quiz questions from it alone, without seeing the source material again), "estimatedMinutes": number}]}${input.availableMinutes ? "\nThe sum of estimatedMinutes should roughly match the learner's available time." : ""}`,
    },
    ...materialParts(input.materials),
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
