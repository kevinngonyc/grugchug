import { Navigate, Route, Routes } from "react-router";
import { Chat } from "./routes/chat";
import { ChatJoin } from "./routes/chat-join";
import { ChatRoom } from "./routes/chat-room";
import { Dashboard } from "./routes/dashboard";
import { Session } from "./routes/session";

export function App() {
  return (
    <div className="flex h-dvh flex-col">
      <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/session" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/session" element={<Session />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/chat/join/:inviteCode" element={<ChatJoin />} />
          <Route path="/chat/:roomId" element={<ChatRoom />} />
          <Route path="/settings" element={<Navigate to="/session" replace />} />
        </Routes>
      </main>
    </div>
  );
}
