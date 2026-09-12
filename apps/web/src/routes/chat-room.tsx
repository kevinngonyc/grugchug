import { useEffect } from "react";
import { Navigate, useParams } from "react-router";
import { writeActiveRoomId } from "@/features/chat";

/** Old per-room links: remember the room, then open it in the session overlay. */
export function ChatRoom() {
  const { roomId } = useParams<{ roomId: string }>();

  useEffect(() => {
    if (roomId) writeActiveRoomId(roomId);
  }, [roomId]);

  return <Navigate to="/session" replace />;
}
