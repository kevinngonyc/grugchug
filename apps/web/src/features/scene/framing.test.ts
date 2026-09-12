import { describe, expect, test } from "bun:test";
import { CAMERA_FOV } from "./constants";
import { driftState, visibleHalfWidth } from "./framing";

describe("visibleHalfWidth", () => {
  test("a 90 degree square frustum sees as far sideways as it is deep", () => {
    expect(visibleHalfWidth(90, 1, 10)).toBeCloseTo(10);
  });

  test("a narrower window frames less of the track", () => {
    const wide = visibleHalfWidth(CAMERA_FOV, 16 / 9, 16);
    const narrow = visibleHalfWidth(CAMERA_FOV, 3 / 4, 16);
    expect(narrow).toBeLessThan(wide);
    // The whole point of measuring per frame: resizing moves the edge by
    // metres, not by a rounding error.
    expect(wide - narrow).toBeGreaterThan(1);
  });

  test("scales with distance, so a further lane frames more", () => {
    expect(visibleHalfWidth(CAMERA_FOV, 16 / 9, 32)).toBeCloseTo(
      2 * visibleHalfWidth(CAMERA_FOV, 16 / 9, 16),
    );
  });

  test("a camera behind the marker has nothing to frame", () => {
    expect(visibleHalfWidth(CAMERA_FOV, 16 / 9, -5)).toBe(0);
  });
});

describe("driftState", () => {
  test("a train inside the frame is drawn where it is", () => {
    expect(driftState(0, 8)).toBe("level");
    expect(driftState(8, 8)).toBe("level");
    expect(driftState(-8, 8)).toBe("level");
  });

  test("past the edge it becomes an arrow, pointing the way it went", () => {
    expect(driftState(8.1, 8)).toBe("ahead");
    expect(driftState(-8.1, 8)).toBe("behind");
    expect(driftState(4_000, 8)).toBe("ahead");
  });

  test("shrinking the window pushes a train out without it having moved", () => {
    const offset = 7;
    expect(driftState(offset, 8)).toBe("level");
    expect(driftState(offset, 5)).toBe("ahead");
  });
});
