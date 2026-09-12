import { expect, test } from "bun:test";
import type { NetworkInterfaceInfo } from "node:os";
import { resolveInviteHostname } from "./invite-host";

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
