import { describe, expect, test } from "bun:test";
import type { ChatPresenceMember } from "@grugchug/shared";
import { ridersLabel } from "./chat-panel";

function member(displayName: string, userId = displayName): ChatPresenceMember {
  return { connectionId: `conn-${userId}`, userId, displayName, efficiency: 0.5 };
}

describe("ridersLabel", () => {
  test("says how to fix an empty room", () => {
    expect(ridersLabel([member("You", "me")], "conn-me")).toContain("invite link");
  });

  test("names one rider", () => {
    expect(ridersLabel([member("You", "me"), member("Ada")], "conn-me")).toBe(
      "Ada is riding with you.",
    );
  });

  test("joins two with an and, and a crowd with commas", () => {
    expect(ridersLabel([member("Ada"), member("Bo")], "conn-me")).toBe(
      "Ada and Bo are riding with you.",
    );
    expect(ridersLabel([member("Ada"), member("Bo"), member("Cy")], "conn-me")).toBe(
      "Ada, Bo and Cy are riding with you.",
    );
  });
});
