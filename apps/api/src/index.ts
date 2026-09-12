// HTTP entrypoint. Framework-free on purpose: Bun.serve routes are enough for
// now, and Express/Hono/Elysia can be mounted here later if the app outgrows it.

import { chatWebSocket } from "./chat/hub";
import { describeLlmConfig } from "./conductor/provider";
import { getDatabase } from "./db";
import { chatSocketRoute, joinRoomRoute, listMessagesRoute, myRoomRoute } from "./routes/chat";
import {
  answerStation,
  askConductor,
  createPlan,
  evaluateProgress,
  getPlan,
  regenerateStation,
  setTimer,
} from "./routes/conductor";
import { health } from "./routes/health";
import { inviteHost } from "./routes/invite-host";
import { createStudySessionRoutes } from "./routes/study-sessions";
import { createUserRoutes } from "./routes/users";
import { createStaticHandler, resolveWebDist } from "./static";
import { sqliteUserRepo } from "./users-repo";

const port = Number(process.env.PORT ?? 3000);
// Anything that is not an API route is the web app: one process serves both
// in production, so the browser sees a single origin (see static.ts).
const webDist = resolveWebDist(process.env.WEB_DIST);
const serveWeb = createStaticHandler(webDist);

const users = createUserRoutes(sqliteUserRepo(getDatabase()));
const study = createStudySessionRoutes(getDatabase());

const server = Bun.serve({
  port,
  websocket: chatWebSocket,
  routes: {
    "/api/health": health,
    "/api/users/:id": {
      GET: (req) => users.get(req.params.id),
      PUT: (req) => users.put(req.params.id, req),
    },
    "/api/study-sessions": {
      POST: (req) => study.create(req),
      GET: (req) => study.list(req),
    },
    "/api/study-sessions/:id/stations": { POST: (req) => study.record(req.params.id, req) },
    "/api/study-sessions/:id/end": { POST: (req) => study.end(req.params.id, req) },
    "/api/conductor/plans": { POST: createPlan },
    "/api/conductor/plans/:id": { GET: getPlan },
    "/api/conductor/stations/:stationId/answer": { POST: answerStation },
    "/api/conductor/stations/:stationId/evaluate": { POST: evaluateProgress },
    "/api/conductor/stations/:stationId/regenerate": { POST: regenerateStation },
    "/api/conductor/ask": { POST: askConductor },
    "/api/conductor/timer": { POST: setTimer },
    "/api/chat/room": { POST: myRoomRoute },
    "/api/chat/invite-host": { GET: (req, server) => inviteHost(req, server.hostname) },
    "/api/chat/rooms/join": { POST: joinRoomRoute },
    "/api/chat/rooms/:roomId/messages": { GET: listMessagesRoute },
    "/api/chat/ws": { GET: chatSocketRoute },
  },
  fetch: serveWeb,
});

console.log(`api listening on http://${server.hostname}:${server.port}`);
console.log(`web app served from ${webDist}`);
console.log(describeLlmConfig());
