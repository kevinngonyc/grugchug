// Serves the built web app from the same process as the API, so one Bun
// server on one host is the whole deployment: same origin for /api and the
// chat socket, no proxy and no CORS. Anything under /api that no route
// claimed stays a 404 rather than turning into the app shell.
import { existsSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// apps/web/dist, from both src/ and dist/ — each is one directory deep in
// apps/api, the same trick db.ts uses for the SQLite default.
export const DEFAULT_WEB_DIST = fileURLToPath(new URL("../../web/dist", import.meta.url));

/** WEB_DIST from the environment, with blank meaning unset. */
export function resolveWebDist(env: string | undefined): string {
  const configured = env?.trim();
  return configured ? configured : DEFAULT_WEB_DIST;
}

// Vite names everything under assets/ by content hash, so those never change
// in place; the shell has to be re-read so a new deploy is picked up.
const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "no-cache";
const HOUR = "public, max-age=3600";

function fileWithin(dist: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const target = resolve(dist, `.${decoded}`);
  if (target !== dist && !target.startsWith(dist + sep)) return null;
  return target;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function send(path: string, cacheControl: string, method: string): Response {
  const file = Bun.file(path);
  return new Response(method === "HEAD" ? null : file, {
    headers: { "content-type": file.type, "cache-control": cacheControl },
  });
}

export function createStaticHandler(webDist: string): (req: Request) => Promise<Response> {
  const dist = resolve(webDist);
  const shell = resolve(dist, "index.html");

  return async (req) => {
    const { pathname } = new URL(req.url);
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    }
    if (!existsSync(shell)) {
      return new Response(
        "The web app has not been built. Run `bun run build` from the repo root, or point WEB_DIST at a build.",
        { status: 404 },
      );
    }

    const target = fileWithin(dist, pathname);
    if (target && target !== dist && isFile(target)) {
      const cache = pathname.startsWith("/assets/") ? IMMUTABLE : HOUR;
      return send(target, cache, req.method);
    }
    // A path with an extension is a file that is not there; anything else is
    // a client-side route, which the shell knows how to render.
    if (extname(pathname) !== "") return new Response("Not found", { status: 404 });
    return send(shell, REVALIDATE, req.method);
  };
}
