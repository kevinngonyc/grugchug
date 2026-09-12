import { networkInterfaces } from "node:os";
import { inviteHostResponseSchema } from "@grugchug/shared";
import { problem } from "./http";

const UNSHAREABLE = ["0.0.0.0", "::", "[::]", "localhost", "127.0.0.1", "::1", "[::1]"];

// A wildcard bind address accepts connections but cannot be shared with another device.
export function resolveInviteHostname(
  hostname: string,
  interfaces = networkInterfaces(),
): string | null {
  if (!UNSHAREABLE.includes(hostname)) return hostname;
  for (const addresses of Object.values(interfaces)) {
    const address = addresses?.find((item) => !item.internal && item.family === "IPv4");
    if (address) return address.address;
  }
  return null;
}

/**
 * The hostname an invite link should carry. Whatever name the browser used to
 * reach us is the one other people can use too — in production that is the
 * public domain in front of a server bound to 0.0.0.0, whose own interfaces
 * only know the machine's raw IP. Only a request from localhost (the Vite dev
 * server proxying to us) needs a LAN address looked up instead.
 */
export function inviteHost(
  req: Request,
  bindHostname = "0.0.0.0",
  interfaces = networkInterfaces(),
): Response {
  const requested = new URL(req.url).hostname;
  const resolved = UNSHAREABLE.includes(requested)
    ? resolveInviteHostname(bindHostname, interfaces)
    : requested;
  if (!resolved)
    return problem(503, "invite_unavailable", "No network address is available for invites");
  return Response.json(inviteHostResponseSchema.parse({ hostname: resolved }));
}
