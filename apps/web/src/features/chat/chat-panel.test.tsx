import { describe, expect, spyOn, test } from "bun:test";
import type { ChatPresenceMember, Journey } from "@grugchug/shared";
import { render, screen } from "@testing-library/react";
import { journeyLabel, RosterList, ridersLabel } from "./chat-panel";

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

describe("journeyLabel", () => {
  test("describes where a rider is", () => {
    expect(journeyLabel(undefined)).toBe("");
    expect(journeyLabel({ state: "idle", station: null })).toBe("");
    expect(journeyLabel({ state: "studying", station: { index: 2, total: 6 } })).toBe(
      "Station 2 of 6",
    );
    expect(journeyLabel({ state: "at-station", station: { index: 2, total: 6 } })).toBe(
      "At station 2",
    );
    expect(journeyLabel({ state: "answering", station: { index: 2, total: 6 } })).toBe(
      "Answering at station 2",
    );
    expect(journeyLabel({ state: "on-break", station: { index: 2, total: 6 } })).toBe("On a break");
    expect(journeyLabel({ state: "finished", station: { index: 6, total: 6 } })).toBe("Finished");
  });
});

describe("RosterList", () => {
  test("renders nothing for an empty roster", () => {
    const { container } = render(<RosterList members={[]} />);
    expect(container.querySelector("ul")).toBeNull();
  });

  test("shows each rider's avatar, name, and where they are", () => {
    const journey: Journey = { state: "studying", station: { index: 2, total: 6 } };
    const { container } = render(
      <RosterList
        members={[
          {
            connectionId: "conn-1",
            userId: "u1",
            displayName: "Ada",
            efficiency: 0.5,
            avatar: "cat",
            journey,
          },
          { connectionId: "conn-2", userId: "c", displayName: "Bob", efficiency: 0.5 },
          { connectionId: "conn-3", userId: "a", displayName: "Cy", efficiency: 0.5 },
        ]}
      />,
    );

    expect(screen.getByText("Ada")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.getByText("Station 2 of 6")).toBeTruthy();

    const images = [...container.querySelectorAll("img")];
    expect(images[0]?.getAttribute("src")).toBe("/characters/cat.png");
    expect(images[1]?.getAttribute("src")).toBe("/characters/poku.png");
    expect(images[2]?.getAttribute("src")).toBe("/characters/bonbon.png");
  });

  test("two tabs of one browser are two rows, without a duplicate-key warning", () => {
    // The roster is one entry per socket, and every tab of a browser shares
    // its stored userId — so rows have to be keyed by connection.
    const errors = spyOn(console, "error").mockImplementation(() => {});
    try {
      const { container } = render(
        <RosterList
          members={[
            { connectionId: "conn-a", userId: "same", displayName: "Kevin", efficiency: 0.5 },
            { connectionId: "conn-b", userId: "same", displayName: "Kevin", efficiency: 0.5 },
          ]}
        />,
      );
      expect(container.querySelectorAll("li")).toHaveLength(2);
      const keyWarnings = errors.mock.calls.filter((args) =>
        args.some((arg) => typeof arg === "string" && arg.includes("same key")),
      );
      expect(keyWarnings).toHaveLength(0);
    } finally {
      errors.mockRestore();
    }
  });
});
