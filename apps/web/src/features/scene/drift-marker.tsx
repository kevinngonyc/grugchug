import { useFrame } from "@react-three/fiber";
import { type RefObject, useRef } from "react";
import type { Group, MeshStandardMaterial, PerspectiveCamera } from "three";
import { Vector3 } from "three";
import {
  DRIFT_AHEAD_COLOR,
  DRIFT_BEHIND_COLOR,
  DRIFT_MARKER_BOB,
  DRIFT_MARKER_BOB_SPEED,
  DRIFT_MARKER_EDGE_MARGIN,
  DRIFT_MARKER_HEIGHT,
  DRIFT_MARKER_OFFSET,
  DRIFT_MARKER_RADIUS,
} from "./constants";
import { type DriftState, driftState, visibleHalfWidth } from "./framing";

type DriftMarkerProps = {
  /** Metres this train is ahead (+) or behind (−) the local one. Unbounded. */
  gap: RefObject<number>;
};

// Scratch vectors. One frame's worth of arithmetic, never held.
const worldPosition = new Vector3();
const viewDirection = new Vector3();
const fromCamera = new Vector3();

// An arrowhead that rides the edge of the picture, standing in for a companion
// train that has left it. Nothing holds those trains back, so a friend who is
// studying harder really does disappear up the line; this is what says which
// way they went.
//
// It sits outside the group that carries the drift, so it is placed against
// the frustum rather than against the train — which is what keeps it on the
// edge when the window is resized, where a fixed world position would slide
// out of frame. The scene's camera is the perspective one set up in
// TrainWorld; an orthographic one would need its own framing.
//
// Reads a ref and never re-renders: the gap changes every frame, and this is a
// moving scene.
export function DriftMarker({ gap }: DriftMarkerProps) {
  const group = useRef<Group>(null);
  const material = useRef<MeshStandardMaterial>(null);
  const drawn = useRef<DriftState>("level");

  useFrame((state) => {
    const marker = group.current;
    if (!marker) return;

    const camera = state.camera as PerspectiveCamera;

    // Distance along the view axis. Independent of the marker's own x, since
    // the camera never looks sideways — so solving for x below cannot change
    // the answer.
    marker.getWorldPosition(worldPosition);
    camera.getWorldDirection(viewDirection);
    const distance = fromCamera.subVectors(worldPosition, camera.position).dot(viewDirection);
    const halfWidth = visibleHalfWidth(camera.fov, camera.aspect, distance);

    // The middle of the picture, in this lane's own coordinates. The camera
    // does not sit over the track, so there is slightly less room one way.
    const centre = camera.position.x - (marker.parent?.matrixWorld.elements[12] ?? 0);
    const drift = driftState(gap.current - centre, halfWidth);

    marker.visible = drift !== "level";
    if (drift === "level") return;

    if (drift !== drawn.current) {
      drawn.current = drift;
      // The cone points +y; a quarter turn about z lays it along the track.
      marker.rotation.z = drift === "ahead" ? -Math.PI / 2 : Math.PI / 2;
      material.current?.color.set(drift === "ahead" ? DRIFT_AHEAD_COLOR : DRIFT_BEHIND_COLOR);
    }

    const edge = Math.max(0, halfWidth - DRIFT_MARKER_EDGE_MARGIN);
    marker.position.x = centre + (drift === "ahead" ? edge : -edge);
    marker.position.y =
      DRIFT_MARKER_OFFSET[1] +
      Math.sin(state.clock.elapsedTime * DRIFT_MARKER_BOB_SPEED) * DRIFT_MARKER_BOB;
  });

  return (
    <group ref={group} position={DRIFT_MARKER_OFFSET} visible={false}>
      <mesh>
        <coneGeometry args={[DRIFT_MARKER_RADIUS, DRIFT_MARKER_HEIGHT, 12]} />
        <meshStandardMaterial ref={material} color={DRIFT_BEHIND_COLOR} />
      </mesh>
    </group>
  );
}
