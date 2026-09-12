import {
  CHAT_USER_HEADER,
  type StartStudySessionRequest,
  type StationResultRequest,
  type StudyOutcome,
  type StudySessionSummary,
  studySessionSchema,
  studySessionSummarySchema,
} from "@grugchug/shared";

import { getUserId } from "@/lib/user-id";

// History is a record, not a dependency: every write here fails quietly so a
// missing API never stops a study session. Reads (the dashboard) throw so the
// page can say the history is unavailable.
export const HISTORY_TIMEOUT_MS = 3000;

function post(url: string, body: unknown, fetchFn: typeof fetch): Promise<Response> {
  return fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/json", [CHAT_USER_HEADER]: getUserId() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(HISTORY_TIMEOUT_MS),
  });
}

export async function startHistory(
  body: StartStudySessionRequest,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await post("/api/study-sessions", body, fetchFn);
    if (!res.ok) return null;
    return studySessionSchema.parse(await res.json()).id;
  } catch {
    return null;
  }
}

export async function recordHistory(
  sessionId: string | null,
  body: StationResultRequest,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  if (sessionId === null) return;
  try {
    await post(`/api/study-sessions/${sessionId}/stations`, body, fetchFn);
  } catch {
    // A lost verdict is a gap in the dashboard, not a broken session.
  }
}

export async function endHistory(
  sessionId: string | null,
  outcome: StudyOutcome,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  if (sessionId === null) return;
  try {
    await post(`/api/study-sessions/${sessionId}/end`, { outcome }, fetchFn);
  } catch {
    // Same: never block quitting or completing on the network.
  }
}

export async function fetchHistory(
  userId: string,
  fetchFn: typeof fetch = fetch,
): Promise<StudySessionSummary[]> {
  const res = await fetchFn(`/api/study-sessions?userId=${encodeURIComponent(userId)}`, {
    headers: { [CHAT_USER_HEADER]: getUserId() },
    signal: AbortSignal.timeout(HISTORY_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GET /api/study-sessions failed with ${res.status}`);
  return studySessionSummarySchema.array().parse(await res.json());
}
