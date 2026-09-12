import { NavLink, Route, Routes } from "react-router";
import { Chat } from "./routes/chat";
import { ChatJoin } from "./routes/chat-join";
import { ChatRoom } from "./routes/chat-room";
import { Dashboard } from "./routes/dashboard";
import { Session } from "./routes/session";
import { Settings } from "./routes/settings";

// Chat is not a destination of its own: it rides along inside a session.
const links = [
  { to: "/", label: "Dashboard" },
  { to: "/session", label: "Session" },
  { to: "/settings", label: "Settings" },
];

export function App() {
  return (
    <div className="flex h-screen flex-col">
      <nav className="flex gap-4 border-b px-6 py-3">
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => (isActive ? "font-semibold" : "text-muted-foreground")}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/session" element={<Session />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/chat/join/:inviteCode" element={<ChatJoin />} />
          <Route path="/chat/:roomId" element={<ChatRoom />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
