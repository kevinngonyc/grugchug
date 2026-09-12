import { Navigate, useParams } from "react-router";
import { JoinRoomView } from "../features/chat";

export function ChatJoin() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  if (!inviteCode) return <Navigate to="/chat" replace />;
  return <JoinRoomView inviteCode={inviteCode} />;
}
