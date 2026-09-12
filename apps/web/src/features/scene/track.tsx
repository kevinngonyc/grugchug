import { Clone, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type RefObject, useRef } from "react";
import type { Group } from "three";
import {
  KIT_ROTATION_Y,
  TRACK_SEGMENT_LENGTH,
  TRACK_SEGMENTS,
  TRACK_Y,
  VISIBLE_HALF_WIDTH,
} from "./constants";
import { MODELS } from "./models";
import { type LaneMotion, wrapWorldX } from "./motion";

type TrackProps = { motion: RefObject<LaneMotion> };

const RUN_LENGTH = TRACK_SEGMENTS * TRACK_SEGMENT_LENGTH;
const START = -Math.floor(TRACK_SEGMENTS / 2) * TRACK_SEGMENT_LENGTH;

// Stable ids: Biome rejects array indexes as React keys.
const SEGMENTS = Array.from({ length: TRACK_SEGMENTS }, (_, i) => ({
  id: `segment-${i}`,
  x: START + i * TRACK_SEGMENT_LENGTH,
}));

// Straight segments laid end to end. Each keeps a world x; on screen it sits
// at worldX - scroll, and once it is far enough behind it jumps to the front.
export function Track({ motion }: TrackProps) {
  const { scene } = useGLTF(MODELS.track);
  const worldX = useRef(SEGMENTS.map((seg) => seg.x));
  const groups = useRef<(Group | null)[]>([]);

  useFrame(() => {
    const scroll = motion.current.scroll;
    for (let i = 0; i < TRACK_SEGMENTS; i++) {
      const w = wrapWorldX(
        worldX.current[i] ?? 0,
        scroll,
        -VISIBLE_HALF_WIDTH - TRACK_SEGMENT_LENGTH,
        RUN_LENGTH,
      );
      worldX.current[i] = w;
      const g = groups.current[i];
      if (g) g.position.x = w - scroll;
    }
  });

  return (
    <group position-y={TRACK_Y}>
      {SEGMENTS.map((seg, i) => (
        <group
          key={seg.id}
          ref={(g) => {
            groups.current[i] = g;
          }}
          position-x={seg.x}
          rotation-y={KIT_ROTATION_Y}
        >
          <Clone object={scene} />
        </group>
      ))}
    </group>
  );
}
