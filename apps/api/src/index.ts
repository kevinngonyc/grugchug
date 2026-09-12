// HTTP entrypoint. Framework-free on purpose: Bun.serve routes are enough for
// now, and Express/Hono/Elysia can be mounted here later if the app outgrows it.
import { chatWebSocket } from "./chat/hub";
import {
  chatSocketRoute,
  createRoomRoute,
  getRoomRoute,
  joinRoomRoute,
  listMessagesRoute,
  listRoomsRoute,
} from "./routes/chat";
import { health } from "./routes/health";

const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  websocket: chatWebSocket,
  routes: {
    "/api/health": health,
    "/api/chat/rooms": { GET: listRoomsRoute, POST: createRoomRoute },
    "/api/chat/rooms/join": { POST: joinRoomRoute },
    "/api/chat/rooms/:roomId": { GET: getRoomRoute },
    "/api/chat/rooms/:roomId/messages": { GET: listMessagesRoute },
    "/api/chat/ws": { GET: chatSocketRoute },
  },
  fetch() {
    return new Response("Not found", { status: 404 });
  },
});

console.log(`api listening on http://localhost:${server.port}`);
