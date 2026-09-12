// SQLite persistence for route plans. The plan is stored as JSON; validation
// already happened when it was assembled, and routePlanSchema.safeParse on
// read is a defence against rows written by an older shape.
import type { Database } from "bun:sqlite";
import { type RoutePlan, routePlanSchema } from "@grugchug/shared";
import { getDatabase } from "../db";

export async function saveRoutePlan(plan: RoutePlan, db: Database = getDatabase()): Promise<void> {
  db.query("INSERT INTO route_plans (id, user_id, plan, created_at) VALUES (?, ?, ?, ?)").run(
    plan.id,
    plan.userId,
    JSON.stringify(plan),
    new Date().toISOString(),
  );
}

export async function getRoutePlanById(
  id: string,
  db: Database = getDatabase(),
): Promise<RoutePlan | null> {
  const row = db
    .query<{ plan: string }, [string]>("SELECT plan FROM route_plans WHERE id = ?")
    .get(id);
  if (!row) return null;
  try {
    const result = routePlanSchema.safeParse(JSON.parse(row.plan));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
