// SQLite persistence for route plans. The plan is stored as JSON; validation
// already happened when it was assembled, and routePlanSchema.safeParse on
// read is a defence against rows written by an older shape.
import type { Database } from "bun:sqlite";
import { type Material, materialSchema, type RoutePlan, routePlanSchema } from "@grugchug/shared";
import { getDatabase } from "../db";

export async function saveRoutePlan(plan: RoutePlan, db: Database = getDatabase()): Promise<void> {
  db.query("INSERT INTO route_plans (id, user_id, plan, created_at) VALUES (?, ?, ?, ?)").run(
    plan.id,
    plan.userId,
    JSON.stringify(plan),
    new Date().toISOString(),
  );
}

// For a plan that already exists — e.g. one station's questions regenerated
// after a failed attempt. saveRoutePlan is an INSERT and would violate the
// primary key on an id already in the table.
export async function updateRoutePlan(
  plan: RoutePlan,
  db: Database = getDatabase(),
): Promise<void> {
  db.query("UPDATE route_plans SET plan = ? WHERE id = ?").run(JSON.stringify(plan), plan.id);
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

// The files a route was built from, so the TA can answer from the material
// itself rather than a one-paragraph station summary. Kept beside the plan,
// not inside it: plans go to the browser, and these can be megabytes of base64.
export async function savePlanMaterials(
  planId: string,
  materials: readonly Material[],
  db: Database = getDatabase(),
): Promise<void> {
  db.query(
    "INSERT OR REPLACE INTO plan_materials (plan_id, materials, created_at) VALUES (?, ?, ?)",
  ).run(planId, JSON.stringify(materials), new Date().toISOString());
}

// Null for a plan built before materials were stored, or a row that no longer
// parses: the TA then answers from the station scope alone.
export async function getPlanMaterials(
  planId: string,
  db: Database = getDatabase(),
): Promise<Material[] | null> {
  const row = db
    .query<{ materials: string }, [string]>(
      "SELECT materials FROM plan_materials WHERE plan_id = ?",
    )
    .get(planId);
  if (!row) return null;
  try {
    const result = materialSchema.array().min(1).safeParse(JSON.parse(row.materials));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
