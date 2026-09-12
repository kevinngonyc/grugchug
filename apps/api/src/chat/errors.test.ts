import { expect, test } from "bun:test";
import { explainFailure, guard } from "./errors";

test("unexpected failures do not expose internal details", () => {
  expect(explainFailure(new Error("Cannot read properties of undefined"))).toBe(
    "something went wrong on the server",
  );
  expect(explainFailure("a thrown string")).toBe("something went wrong on the server");
});

test("guard turns a rejection into a 500 carrying the explanation", async () => {
  const wrapped = guard("test route", async () => {
    throw new Error("boom");
  });
  const res = await wrapped();
  expect(res.status).toBe(500);
  const body = await res.json();
  expect(body.error).toBe("server_error");
  expect(body.detail).toBe("something went wrong on the server");
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

test("storage permission failures explain setup without exposing paths", () => {
  for (const code of ["SQLITE_CANTOPEN", "SQLITE_READONLY_DIRECTORY", "EACCES", "EPERM", "EROFS"]) {
    const cause = Object.assign(new Error("secret/path"), { code });
    expect(explainFailure(cause)).toContain("check SQLITE_PATH");
    expect(explainFailure(cause)).not.toContain("secret/path");
  }
});
