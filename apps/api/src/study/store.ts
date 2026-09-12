// SQLite persistence for study history: one row per run through a route, one
// row per attempt at a station. Shapes come from @grugchug/shared.
import type { Database } from "bun:sqlite";
import type {
  StartStudySessionRequest,
  StationResult,
  StationResultRequest,
  StudyOutcome,
  StudySession,
  StudySessionSummary,
} from "@grugchug/shared";
import { getDatabase } from "../db";

type SessionRow = {
  id: string;
  user_id: string;
  plan_id: string;
  station_total: number;
  started_at: string;
  ended_at: string | null;
  outcome: StudyOutcome | null;
};

type ResultRow = {
  session_id: string;
  station_index: number;
  station_id: string;
  passed: number;
  mean_score: number;
  recorded_at: string;
};

const SESSION_COLUMNS = "id, user_id, plan_id, station_total, started_at, ended_at, outcome";

function toSession(row: SessionRow): StudySession {
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    stationTotal: row.station_total,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    outcome: row.outcome,
  };
}

function toResult(row: ResultRow): StationResult {
  return {
    sessionId: row.session_id,
    stationIndex: row.station_index,
    stationId: row.station_id,
    passed: row.passed === 1,
    meanScore: row.mean_score,
    recordedAt: row.recorded_at,
  };
}

export async function startStudySession(
  input: StartStudySessionRequest,
  db: Database = getDatabase(),
): Promise<StudySession> {
  const row = db
    .query<SessionRow, [string, string, string, number, string]>(
      `INSERT INTO study_sessions (${SESSION_COLUMNS}) VALUES (?, ?, ?, ?, ?, NULL, NULL)
       RETURNING ${SESSION_COLUMNS}`,
    )
    .get(
      crypto.randomUUID(),
      input.userId,
      input.planId,
      input.stationTotal,
      new Date().toISOString(),
    );
  if (!row) throw new Error("study session insert returned no row");
  return toSession(row);
}

export async function recordStationResult(
  sessionId: string,
  input: StationResultRequest,
  db: Database = getDatabase(),
): Promise<StationResult | null> {
  const exists = db
    .query<{ id: string }, [string]>("SELECT id FROM study_sessions WHERE id = ?")
    .get(sessionId);
  if (!exists) return null;
  const row = db
    .query<ResultRow, [string, number, string, number, number, string]>(
      `INSERT INTO station_results (session_id, station_index, station_id, passed, mean_score, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING session_id, station_index, station_id, passed, mean_score, recorded_at`,
    )
    .get(
      sessionId,
      input.stationIndex,
      input.stationId,
      input.passed ? 1 : 0,
      input.meanScore,
      new Date().toISOString(),
    );
  if (!row) throw new Error("station result insert returned no row");
  return toResult(row);
}

export async function endStudySession(
  sessionId: string,
  outcome: StudyOutcome,
  db: Database = getDatabase(),
): Promise<StudySession | null> {
  const row = db
    .query<SessionRow, [string, string, string]>(
      `UPDATE study_sessions SET ended_at = ?, outcome = ?
       WHERE id = ? AND ended_at IS NULL RETURNING ${SESSION_COLUMNS}`,
    )
    .get(new Date().toISOString(), outcome, sessionId);
  return row ? toSession(row) : null;
}

// stationsPassed counts stations whose most recent attempt passed.
export async function listStudySessions(
  userId: string,
  db: Database = getDatabase(),
  limit = 20,
): Promise<StudySessionSummary[]> {
  const rows = db
    .query<SessionRow & { stations_passed: number }, [string, number]>(
      `SELECT s.id, s.user_id, s.plan_id, s.station_total, s.started_at, s.ended_at, s.outcome,
              (SELECT COUNT(*) FROM station_results r
                WHERE r.session_id = s.id AND r.passed = 1
                  AND r.id = (SELECT MAX(r2.id) FROM station_results r2
                              WHERE r2.session_id = r.session_id
                                AND r2.station_index = r.station_index)) AS stations_passed
       FROM study_sessions s
       WHERE s.user_id = ?
       ORDER BY s.started_at DESC, s.id DESC
       LIMIT ?`,
    )
    .all(userId, limit);
  return rows.map((row) => ({ ...toSession(row), stationsPassed: row.stations_passed }));
}
