import { Navigate } from "react-router";

/** Chat has no page of its own any more: it is an overlay inside a session. */
export function Chat() {
  return <Navigate to="/session" replace />;
}
