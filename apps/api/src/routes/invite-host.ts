import { networkInterfaces } from "node:os";
import { inviteHostResponseSchema } from "@grugchug/shared";
import { problem } from "./http";

// A wildcard bind address accepts connections but cannot be shared with another device.
export function resolveInviteHostname(
  hostname: string,
  interfaces = networkInterfaces(),
): string | null {
  if (!["0.0.0.0", "::", "[::]", "localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname)) {
    return hostname;
  }
  for (const addresses of Object.values(interfaces)) {
    const address = addresses?.find((item) => !item.internal && item.family === "IPv4");
    if (address) return address.address;
  }
  return null;
}

export function inviteHost(hostname = "0.0.0.0"): Response {
  const resolved = resolveInviteHostname(hostname);
  if (!resolved)
    return problem(503, "invite_unavailable", "No network address is available for invites");
  return Response.json(inviteHostResponseSchema.parse({ hostname: resolved }));
}
