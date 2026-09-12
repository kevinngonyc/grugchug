// SQLite persistence for route plans. The plan is stored as JSON; validation
// already happened when it was assembled, and routePlanSchema.safeParse on
// read is a defence against rows written by an older shape.
import type { Database } from "bun:sqlite";
import { type Material, materialSchema, type RoutePlan, routePlanSchema } from "@grugchug/shared";
import { getDatabase } from "../db";

// How long a stored material set outlives the last route built from it.
// History keeps pointing at the plan; only the megabytes of base64 go.
export const MATERIALS_RETENTION_MS = 30 * 24 * 60 * 60_000;

// Parsed material sets by hash. Every question to the TA reads its plan's
// materials, and parsing megabytes of base64 through zod on each one is the
// slow part; the rows themselves are immutable, so this never goes stale.
const MAX_REMEMBERED_SETS = 8;
const remembered = new Map<string, Material[]>();

function remember(hash: string, materials: Material[]): void {
  remembered.set(hash, materials);
  if (remembered.size > MAX_REMEMBERED_SETS) {
    const oldest = remembered.keys().next().value;
    if (oldest !== undefined) remembered.delete(oldest);
  }
}

function insertRoutePlan(plan: RoutePlan, db: Database, now: number): void {
  db.query("INSERT INTO route_plans (id, user_id, plan, created_at) VALUES (?, ?, ?, ?)").run(
    plan.id,
    plan.userId,
    JSON.stringify(plan),
    new Date(now).toISOString(),
  );
}

export async function saveRoutePlan(
  plan: RoutePlan,
  db: Database = getDatabase(),
  now: number = Date.now(),
): Promise<void> {
  insertRoutePlan(plan, db, now);
}

/**
 * The plan, and the files it was built from for the TA to answer from later.
 * Materials are kept once per content hash, not per plan — regenerating a
 * route or studying the same files again adds a plan row, not another copy
 * of the upload — and beside the plan rather than inside it, since plans go
 * to the browser and these can be megabytes of base64. One transaction, so a
 * failure to store the files never leaves a plan behind without them.
 */
export async function saveRoutePlanWithMaterials(
  plan: RoutePlan,
  materials: readonly Material[],
  db: Database = getDatabase(),
  now: number = Date.now(),
): Promise<void> {
  db.transaction(() => {
    insertRoutePlan(plan, db, now);
    db.query(
      "INSERT OR IGNORE INTO material_sets (material_hash, materials, created_at) VALUES (?, ?, ?)",
    ).run(plan.materialHash, JSON.stringify(materials), new Date(now).toISOString());
    pruneMaterialSets(db, now);
  })();
}

// Sets older than the retention window that no route inside the window was
// built from, plus per-plan rows from before sets existed. Plans are kept:
// study history refers to them, and they are small.
function pruneMaterialSets(db: Database, now: number): void {
  const cutoff = new Date(now - MATERIALS_RETENTION_MS).toISOString();
  db.query(
    `DELETE FROM material_sets
      WHERE created_at < ?1
        AND material_hash NOT IN (
          SELECT json_extract(plan, '$.materialHash') FROM route_plans WHERE created_at >= ?1
        )`,
  ).run(cutoff);
  db.query("DELETE FROM plan_materials WHERE created_at < ?").run(cutoff);
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

function parseMaterials(json: string): Material[] | null {
  try {
    const result = materialSchema.array().min(1).safeParse(JSON.parse(json));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * The files a route was built from. Null for a plan whose materials were
 * never stored, were pruned, or no longer parse: the TA then answers from
 * the station scope alone, as it always did.
 */
export async function getMaterialsForPlan(
  plan: RoutePlan,
  db: Database = getDatabase(),
): Promise<Material[] | null> {
  const cached = remembered.get(plan.materialHash);
  if (cached) return cached;

  const set = db
    .query<{ materials: string }, [string]>(
      "SELECT materials FROM material_sets WHERE material_hash = ?",
    )
    .get(plan.materialHash);
  // Plans from before sets existed kept their files under their own id.
  const legacy = set
    ? null
    : db
        .query<{ materials: string }, [string]>(
          "SELECT materials FROM plan_materials WHERE plan_id = ?",
        )
        .get(plan.id);
  const json = set?.materials ?? legacy?.materials;
  if (json === undefined) return null;

  const materials = parseMaterials(json);
  if (materials) remember(plan.materialHash, materials);
  return materials;
}
