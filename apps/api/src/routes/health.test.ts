import { expect, test } from "bun:test";
import { health } from "./health";

test("health reports ok", async () => {
  const res = health();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
