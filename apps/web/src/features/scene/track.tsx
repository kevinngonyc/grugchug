import { Clone, useGLTF } from "@react-three/drei";
import type { RefObject } from "react";
import { KIT_ROTATION_Y, TRACK_SEGMENT_LENGTH, TRACK_SEGMENTS, TRACK_Y } from "./constants";
import { MODELS } from "./models";
import type { LaneMotion } from "./motion";

type TrackProps = { motion: RefObject<LaneMotion> };

const START = -Math.floor(TRACK_SEGMENTS / 2) * TRACK_SEGMENT_LENGTH;

// Stable ids: Biome rejects array indexes as React keys.
const SEGMENTS = Array.from({ length: TRACK_SEGMENTS }, (_, i) => ({
  id: `segment-${i}`,
  x: START + i * TRACK_SEGMENT_LENGTH,
}));

// Straight segments laid end to end, centred on the train.
export function Track(_props: TrackProps) {
  const { scene } = useGLTF(MODELS.track);
  return (
    <group position-y={TRACK_Y}>
      {SEGMENTS.map((seg) => (
        <group key={seg.id} position-x={seg.x} rotation-y={KIT_ROTATION_Y}>
          <Clone object={scene} />
        </group>
      ))}
    </group>
  );
}
