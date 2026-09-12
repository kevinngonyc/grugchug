import { NavLink, Route, Routes } from "react-router";
import { Dashboard } from "./routes/dashboard";
import { Session } from "./routes/session";
import { Settings } from "./routes/settings";

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/session", label: "Session" },
  { to: "/settings", label: "Settings" },
];

export function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <nav className="flex gap-4 border-b px-6 py-3">
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) => (isActive ? "font-semibold" : "text-muted-foreground")}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="flex flex-1 flex-col p-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/session" element={<Session />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
