import { expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { SpeedRing } from "./speed-ring";

test("fills the ring from the focus fraction", () => {
  const circumference = 2 * Math.PI * 8;
  const { container } = render(<SpeedRing fraction={0.5} />);
  const progress = container.querySelectorAll("circle")[1];
  expect(progress?.getAttribute("stroke-dashoffset")).toBe(String(circumference * 0.5));
});
