import { describe, expect, test } from "bun:test";
import { openDatabase } from "../db";
import { fixtureRoutePlan } from "./fixtures";
import { getPlanMaterials, getRoutePlanById, savePlanMaterials, saveRoutePlan } from "./store";

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

describe("plan materials store", () => {
  test("saves and reads a plan's materials back", async () => {
    const db = openDatabase(":memory:");
    const materials = [
      { kind: "text" as const, text: "lecture one" },
      { kind: "pdf" as const, base64: "JVBERi0xLjQK" },
    ];
    await savePlanMaterials("p1", materials, db);
    expect(await getPlanMaterials("p1", db)).toEqual(materials);
  });

  test("a plan with no stored materials reads as null", async () => {
    expect(await getPlanMaterials("nope", openDatabase(":memory:"))).toBeNull();
  });
});
