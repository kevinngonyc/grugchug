import { describe, expect, test } from "bun:test";
import { openDatabase } from "../db";
import { fixtureRoutePlan } from "./fixtures";
import { getRoutePlanById, saveRoutePlan } from "./store";

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
