// MongoDB persistence for route plans. Thin on purpose: validation already
// happened when the plan was assembled, and routePlanSchema.safeParse here
// on read is a defense against documents written by an older shape.
import { type RoutePlan, routePlanSchema } from "@grugchug/shared";
import { getDb } from "../db";

const COLLECTION = "routePlans";

export async function saveRoutePlan(plan: RoutePlan): Promise<void> {
  const db = await getDb();
  await db.collection(COLLECTION).insertOne(plan);
}

export async function getRoutePlanById(id: string): Promise<RoutePlan | null> {
  const db = await getDb();
  const doc = await db.collection(COLLECTION).findOne({ id });
  if (!doc) return null;
  const result = routePlanSchema.safeParse(doc);
  return result.success ? result.data : null;
}
