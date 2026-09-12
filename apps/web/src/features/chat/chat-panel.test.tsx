import { describe, expect, test } from "bun:test";
import type { ChatPresenceMember } from "@grugchug/shared";
import { ridersLabel } from "./chat-panel";

function member(displayName: string, userId = displayName): ChatPresenceMember {
  return { userId, displayName, efficiency: 0.5 };
}

describe("ridersLabel", () => {
  test("says how to fix an empty room", () => {
    expect(ridersLabel([member("You", "me")], "me")).toContain("invite link");
  });

  test("names one rider", () => {
    expect(ridersLabel([member("You", "me"), member("Ada")], "me")).toBe("Ada is riding with you.");
  });

  test("joins two with an and, and a crowd with commas", () => {
    expect(ridersLabel([member("Ada"), member("Bo")], "me")).toBe(
      "Ada and Bo are riding with you.",
    );
    expect(ridersLabel([member("Ada"), member("Bo"), member("Cy")], "me")).toBe(
      "Ada, Bo and Cy are riding with you.",
    );
  });
});
