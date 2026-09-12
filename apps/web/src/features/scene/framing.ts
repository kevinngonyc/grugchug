// What the camera can actually see, in world metres. The scene is laid out in
// metres along a track, but how much of that track is on screen depends on the
// window: a narrower window frames less of it. Anything that has to sit at the
// edge of the picture — rather than at a fixed place in the world — measures
// it here.
//
// Pure, so the trigonometry is checked without a renderer.

/** Where a companion train is, relative to the picture. */
export type DriftState = "level" | "ahead" | "behind";

/**
 * Half the world-space width of a perspective frustum at `distance` along the
 * view axis. The camera never rolls or looks sideways in this scene, so this
 * is a distance in world x either side of the camera's own x — and it holds
 * for the whole of that cross-section, whatever height you read it at.
 */
export function visibleHalfWidth(fovDegrees: number, aspect: number, distance: number): number {
  // fov is vertical, hence the aspect; /360 is (fov/2) in radians.
  return Math.tan((fovDegrees * Math.PI) / 360) * aspect * Math.max(0, distance);
}

/**
 * Whether a train `offset` metres from the middle of the picture is still in
 * it. Nothing caps the drift, so this is the only thing that decides when a
 * train stops being drawn where it is and starts being an arrow at the edge.
 */
export function driftState(offset: number, halfWidth: number): DriftState {
  if (offset > halfWidth) return "ahead";
  if (offset < -halfWidth) return "behind";
  return "level";
}
