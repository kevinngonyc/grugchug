// HTTP entrypoint. Framework-free on purpose: Bun.serve routes are enough for
// now, and Express/Hono/Elysia can be mounted here later if the app outgrows it.

import { chatWebSocket } from "./chat/hub";
import { chatSocketRoute, joinRoomRoute, listMessagesRoute, myRoomRoute } from "./routes/chat";
import { answerStation, askConductor, createPlan, getPlan } from "./routes/conductor";
import { health } from "./routes/health";

const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  websocket: chatWebSocket,
  routes: {
    "/api/health": health,
    "/api/conductor/plans": { POST: createPlan },
    "/api/conductor/plans/:id": { GET: getPlan },
    "/api/conductor/stations/:stationId/answer": { POST: answerStation },
    "/api/conductor/ask": { POST: askConductor },
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
