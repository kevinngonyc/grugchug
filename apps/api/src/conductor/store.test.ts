import { describe, expect, test } from "bun:test";
import type { Material, RoutePlan } from "@grugchug/shared";
import { openDatabase } from "../db";
import { fixtureRoutePlan } from "./fixtures";
import {
  getMaterialsForPlan,
  getRoutePlanById,
  MATERIALS_RETENTION_MS,
  saveRoutePlan,
  saveRoutePlanWithMaterials,
} from "./store";

const materials: Material[] = [
  { kind: "text", text: "lecture one" },
  { kind: "pdf", base64: "JVBERi0xLjQK" },
];

// Every test gets its own hash: stored sets are also remembered in memory
// across databases, so two tests sharing one would see each other's rows.
function planWith(id: string, materialHash: string): RoutePlan {
  return { ...fixtureRoutePlan, id, materialHash };
}

function countSets(db: ReturnType<typeof openDatabase>): number {
  return db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM material_sets").get()?.n ?? -1;
}

describe("route plan store", () => {
  test("saves and reads a plan back unchanged", async () => {
    const db = openDatabase(":memory:");
    await saveRoutePlan(fixtureRoutePlan, db);
    expect(await getRoutePlanById(fixtureRoutePlan.id, db)).toEqual(fixtureRoutePlan);
  });

  test("a missing plan is null", async () => {
    const db = openDatabase(":memory:");
    expect(await getRoutePlanById("nope", db)).toBeNull();
  });

  test("a stored document that no longer matches the schema reads as null", async () => {
    const db = openDatabase(":memory:");
    db.run(
      "INSERT INTO route_plans (id, user_id, plan, created_at) VALUES ('old', 'u', '{\"id\":\"old\"}', 'x')",
    );
    expect(await getRoutePlanById("old", db)).toBeNull();
  });
});

describe("materials store", () => {
  test("two routes built from the same files share one stored copy", async () => {
    const db = openDatabase(":memory:");
    const first = planWith("p1", "shared-files");
    const second = planWith("p2", "shared-files");
    await saveRoutePlanWithMaterials(first, materials, db);
    await saveRoutePlanWithMaterials(second, materials, db);

    expect(countSets(db)).toBe(1);
    expect(await getRoutePlanById("p2", db)).toEqual(second);
    expect(await getMaterialsForPlan(second, db)).toEqual(materials);
  });

  test("a plan built before material sets existed still finds its materials", async () => {
    const db = openDatabase(":memory:");
    const legacy = planWith("legacy", "legacy-hash");
    await saveRoutePlan(legacy, db);
    db.query("INSERT INTO plan_materials (plan_id, materials, created_at) VALUES (?, ?, ?)").run(
      "legacy",
      JSON.stringify(materials),
      new Date().toISOString(),
    );

    expect(await getMaterialsForPlan(legacy, db)).toEqual(materials);
  });

  test("a plan with no stored materials reads as null", async () => {
    const db = openDatabase(":memory:");
    expect(await getMaterialsForPlan(planWith("bare", "no-files"), db)).toBeNull();
  });

  test("saving the plan and its materials is all or nothing", async () => {
    const db = openDatabase(":memory:");
    db.run("DROP TABLE material_sets");
    const plan = planWith("half", "half-hash");

    await expect(saveRoutePlanWithMaterials(plan, materials, db)).rejects.toThrow();
    expect(await getRoutePlanById("half", db)).toBeNull();
  });

  test("material sets no recent route was built from are pruned on the next save", async () => {
    const db = openDatabase(":memory:");
    const longAgo = Date.now() - 2 * MATERIALS_RETENTION_MS;
    const remaining = () =>
      db
        .query<{ material_hash: string }, []>("SELECT material_hash FROM material_sets ORDER BY 1")
        .all()
        .map((row) => row.material_hash);
    await saveRoutePlanWithMaterials(planWith("stale", "stale-hash"), materials, db, longAgo);
    await saveRoutePlanWithMaterials(planWith("kept-old", "kept-hash"), materials, db, longAgo);
    expect(countSets(db)).toBe(2);

    // A recent route built from the old "kept" files again keeps that set
    // alive; the "stale" one, which nothing recent used, goes.
    await saveRoutePlanWithMaterials(planWith("kept-new", "kept-hash"), materials, db);
    expect(remaining()).toEqual(["kept-hash"]);

    await saveRoutePlanWithMaterials(planWith("fresh", "fresh-hash"), materials, db);
    expect(remaining()).toEqual(["fresh-hash", "kept-hash"]);
    // The route itself stays: history still points at it.
    expect(await getRoutePlanById("stale", db)).not.toBeNull();
  });

  test("materials read once are served from memory afterwards", async () => {
    const db = openDatabase(":memory:");
    const plan = planWith("memo", "memo-hash");
    await saveRoutePlanWithMaterials(plan, materials, db);
    expect(await getMaterialsForPlan(plan, db)).toEqual(materials);

    db.run("DELETE FROM material_sets");
    expect(await getMaterialsForPlan(plan, db)).toEqual(materials);
  });
});
