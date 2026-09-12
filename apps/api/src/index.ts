// HTTP entrypoint. Framework-free on purpose: Bun.serve routes are enough for
// now, and Express/Hono/Elysia can be mounted here later if the app outgrows it.
import { health } from "./routes/health";

const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  routes: {
    "/api/health": health,
  },
  fetch() {
    return new Response("Not found", { status: 404 });
  },
});

console.log(`api listening on http://localhost:${server.port}`);
