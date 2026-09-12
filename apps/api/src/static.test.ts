// Offline: a throwaway directory stands in for apps/web/dist.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStaticHandler, resolveWebDist } from "./static";

let root: string;
let dist: string;
let serve: (req: Request) => Promise<Response>;

const get = (path: string) => serve(new Request(`http://study.test${path}`));

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "grugchug-static-"));
  dist = join(root, "dist");
  mkdirSync(join(dist, "assets"), { recursive: true });
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>grugchug</title>");
  writeFileSync(join(dist, "assets", "app-abc123.js"), "console.log('app')");
  writeFileSync(join(dist, "favicon.ico"), "icon");
  // Outside the web build: must never be reachable through it.
  writeFileSync(join(root, "secret.txt"), "the LLM keys");
  serve = createStaticHandler(dist);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("the web build served beside the API", () => {
  test("the root serves index.html, never cached so a new deploy shows up", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(await res.text()).toContain("<title>grugchug</title>");
  });

  test("hashed assets are served immutable", async () => {
    const res = await get("/assets/app-abc123.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await res.text()).toBe("console.log('app')");
  });

  test("a client-side route falls back to index.html", async () => {
    const res = await get("/session?dev");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<title>grugchug</title>");
  });

  test("a missing file with an extension is a 404, not the app shell", async () => {
    expect((await get("/assets/missing.js")).status).toBe(404);
  });

  test("an unknown API path stays a 404", async () => {
    const res = await get("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("<title>");
  });

  test("nothing outside the build directory is reachable", async () => {
    for (const path of ["/../secret.txt", "/%2e%2e/secret.txt", "/assets/../../secret.txt"]) {
      const res = await get(path);
      expect(await res.text()).not.toContain("the LLM keys");
    }
  });

  test("only GET and HEAD serve files", async () => {
    const res = await serve(new Request("http://study.test/", { method: "POST" }));
    expect(res.status).toBe(405);
  });

  test("with no web build at all, every page is a 404 that says so", async () => {
    const missing = createStaticHandler(join(root, "not-built"));
    const res = await missing(new Request("http://study.test/"));
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("bun run build");
  });
});

describe("resolveWebDist", () => {
  test("WEB_DIST overrides the default, and blank means unset", () => {
    expect(resolveWebDist("/srv/grugchug/web")).toBe("/srv/grugchug/web");
    expect(resolveWebDist("  ")).toBe(resolveWebDist(undefined));
    expect(resolveWebDist(undefined).endsWith(join("apps", "web", "dist"))).toBe(true);
  });
});
