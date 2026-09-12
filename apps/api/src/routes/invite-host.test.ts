import { expect, test } from "bun:test";
import type { NetworkInterfaceInfo } from "node:os";
import { inviteHost, resolveInviteHostname } from "./invite-host";

// In production the API binds 0.0.0.0 behind a tunnel or proxy, and the only
// name that reaches it from outside is the one the browser used. The bind
// address and the machine's own interfaces say nothing useful there.
test("an invite keeps the hostname the request arrived on, whatever the server is bound to", async () => {
  const machine = { eth0: [address("45.77.76.11", false)] };
  const res = inviteHost(
    new Request("http://grugchug.example.com/api/chat/invite-host"),
    "0.0.0.0",
    machine,
  );
  expect(await res.json()).toEqual({ hostname: "grugchug.example.com" });
});

test("a request from a localhost page still gets a LAN address to share in dev", async () => {
  const machine = { lo0: [address("127.0.0.1", true)], en0: [address("192.168.1.20", false)] };
  const res = inviteHost(
    new Request("http://localhost:5173/api/chat/invite-host"),
    "0.0.0.0",
    machine,
  );
  expect(await res.json()).toEqual({ hostname: "192.168.1.20" });
});

const address = (ip: string, internal: boolean): NetworkInterfaceInfo => ({
  address: ip,
  internal,
  family: "IPv4",
  netmask: "255.255.255.0",
  mac: "00:00:00:00:00:00",
  cidr: `${ip}/24`,
});

test("uses the server's configured hostname", () => {
  expect(resolveInviteHostname("study.example.com", {})).toBe("study.example.com");
  expect(resolveInviteHostname("192.168.1.20", {})).toBe("192.168.1.20");
});

test("resolves wildcard and loopback binds to an external network address", () => {
  const interfaces = { lo0: [address("127.0.0.1", true)], en0: [address("192.168.1.20", false)] };
  for (const host of ["0.0.0.0", "::", "localhost", "127.0.0.1"]) {
    expect(resolveInviteHostname(host, interfaces)).toBe("192.168.1.20");
  }
});

test("does not invent an invite host when there is no network interface", () => {
  expect(resolveInviteHostname("0.0.0.0", {})).toBeNull();
});
