import { Navigate } from "react-router";

/**
 * Old per-room links. There is one room now and it is the last one you joined,
 * so a room id no longer selects anything: these land in the session.
 */
export function ChatRoom() {
  return <Navigate to="/session" replace />;
}
