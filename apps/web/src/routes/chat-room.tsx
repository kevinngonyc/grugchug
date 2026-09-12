import { Navigate, useParams } from "react-router";
import { ChatRoomView } from "../features/chat";

export function ChatRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  if (!roomId) return <Navigate to="/chat" replace />;
  return <ChatRoomView roomId={roomId} />;
}
