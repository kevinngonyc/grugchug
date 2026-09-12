import { expect, test } from "bun:test";
import { explainFailure, guard } from "./errors";

test("names the missing MONGODB_URI, because that is a setup mistake", () => {
  expect(explainFailure(new Error("MONGODB_URI is not set"))).toContain("apps/api/.env");
});

test("names an unreachable database", () => {
  const detail = explainFailure(new Error("connect ECONNREFUSED 127.0.0.1:27017"));
  expect(detail).toContain("docker compose up -d");
});

test("says nothing specific about anything else", () => {
  expect(explainFailure(new Error("Cannot read properties of undefined"))).toBe(
    "something went wrong on the server",
  );
  expect(explainFailure("a thrown string")).toBe("something went wrong on the server");
});

test("guard turns a rejection into a 500 carrying the explanation", async () => {
  const wrapped = guard("test route", async () => {
    throw new Error("MONGODB_URI is not set");
  });
  const res = await wrapped();
  expect(res.status).toBe(500);
  const body = await res.json();
  expect(body.error).toBe("server_error");
  expect(body.detail).toContain("apps/api/.env");
});

test("guard passes a successful response through untouched", async () => {
  const ok = Response.json({ ok: true });
  const wrapped = guard("test route", async () => ok);
  expect(await wrapped()).toBe(ok);
});

test("guard forwards every argument", async () => {
  const wrapped = guard("test route", async (a: number, b: string) => `${a}${b}`);
  expect(await wrapped(1, "x")).toBe("1x");
});
