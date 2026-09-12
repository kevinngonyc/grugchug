// HTTP entrypoint. Framework-free on purpose: Bun.serve routes are enough for
// now, and Express/Hono/Elysia can be mounted here later if the app outgrows it.

import { chatWebSocket } from "./chat/hub";
import { getDatabase } from "./db";
import { chatSocketRoute, joinRoomRoute, listMessagesRoute, myRoomRoute } from "./routes/chat";
import {
  answerStation,
  askConductor,
  createPlan,
  evaluateProgress,
  getPlan,
  setTimer,
} from "./routes/conductor";
import { health } from "./routes/health";
import { createStudySessionRoutes } from "./routes/study-sessions";
import { createUserRoutes } from "./routes/users";
import { sqliteUserRepo } from "./users-repo";

const port = Number(process.env.PORT ?? 3000);

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
    "/api/conductor/ask": { POST: askConductor },
    "/api/conductor/timer": { POST: setTimer },
    "/api/chat/room": { POST: myRoomRoute },
    "/api/chat/rooms/join": { POST: joinRoomRoute },
    "/api/chat/rooms/:roomId/messages": { GET: listMessagesRoute },
    "/api/chat/ws": { GET: chatSocketRoute },
  },
  fetch() {
    return new Response("Not found", { status: 404 });
  },
});

console.log(`api listening on http://localhost:${server.port}`);
