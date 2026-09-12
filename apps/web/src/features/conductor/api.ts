// HTTP client for the conductor. Responses are parsed with the shared
// schemas so a drifting API surfaces here rather than deep inside a
// component — same shape as features/chat/api.ts.
import type {
  AnswerResult,
  AnswerSubmission,
  AskRequest,
  AskResponse,
  CreatePlanRequest,
  EvaluateProgressRequest,
  EvaluateProgressResponse,
  PublicRoutePlan,
  PublicStation,
  RegenerateStationRequest,
  SetTimerRequest,
  SetTimerResponse,
} from "@grugchug/shared";
import {
  answerResultSchema,
  askResponseSchema,
  evaluateProgressResponseSchema,
  publicRoutePlanSchema,
  publicStationSchema,
  setTimerResponseSchema,
} from "@grugchug/shared";

import { request } from "./request";

export { ConductorApiError } from "./request";

export function createPlan(body: CreatePlanRequest): Promise<PublicRoutePlan> {
  return request("/conductor/plans", publicRoutePlanSchema, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getPlan(planId: string): Promise<PublicRoutePlan> {
  return request(`/conductor/plans/${encodeURIComponent(planId)}`, publicRoutePlanSchema);
}

export function submitAnswer(stationId: string, body: AnswerSubmission): Promise<AnswerResult> {
  return request(
    `/conductor/stations/${encodeURIComponent(stationId)}/answer`,
    answerResultSchema,
    { method: "POST", body: JSON.stringify(body) },
  );
}

// A fresh set of questions for one station, after a failed attempt — so a
// retry is an actual second attempt, not the same 8 questions again.
export function regenerateStationQuestions(
  stationId: string,
  body: RegenerateStationRequest,
): Promise<PublicStation> {
  return request(
    `/conductor/stations/${encodeURIComponent(stationId)}/regenerate`,
    publicStationSchema,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function evaluateProgress(
  stationId: string,
  body: EvaluateProgressRequest,
): Promise<EvaluateProgressResponse> {
  return request(
    `/conductor/stations/${encodeURIComponent(stationId)}/evaluate`,
    evaluateProgressResponseSchema,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function askConductor(body: AskRequest): Promise<AskResponse> {
  return request("/conductor/ask", askResponseSchema, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function setTimer(body: SetTimerRequest): Promise<SetTimerResponse> {
  return request("/conductor/timer", setTimerResponseSchema, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
