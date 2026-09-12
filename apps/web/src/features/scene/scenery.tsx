import { Clone, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type RefObject, useMemo, useRef } from "react";
import type { Group, Object3D } from "three";
import {
  RECYCLE_SPAN,
  SCENERY_MAX_DEPTH,
  SCENERY_MIN_DEPTH,
  SCENERY_PER_LANE,
  SCENERY_SCALE,
  VISIBLE_HALF_WIDTH,
} from "./constants";
import { MODELS } from "./models";
import type { LaneMotion } from "./motion";

type SceneryProps = { motion: RefObject<LaneMotion> };

type Slot = { id: string; model: number; worldX: number; z: number; yaw: number };

// A fixed pool of trees and rocks behind the track. Each slot keeps a world x
// and jumps forward by RECYCLE_SPAN once it scrolls out of view.
export function Scenery({ motion }: SceneryProps) {
  // useGLTF accepts an array and returns one GLTF per URL, in order.
  const scenes = useGLTF([...MODELS.scenery]).map((gltf) => gltf.scene);
  const slots = useMemo<Slot[]>(
    () =>
      Array.from({ length: SCENERY_PER_LANE }, (_, i) => ({
        id: `slot-${i}`,
        model: Math.floor(Math.random() * MODELS.scenery.length),
        worldX: -VISIBLE_HALF_WIDTH + Math.random() * RECYCLE_SPAN,
        z: -(SCENERY_MIN_DEPTH + Math.random() * (SCENERY_MAX_DEPTH - SCENERY_MIN_DEPTH)),
        yaw: Math.random() * Math.PI * 2,
      })),
    [],
  );
  const groups = useRef<(Group | null)[]>([]);

  useFrame(() => {
    const scroll = motion.current.scroll;
    slots.forEach((slot, i) => {
      let x = slot.worldX - scroll;
      if (x < -VISIBLE_HALF_WIDTH) {
        slot.worldX += RECYCLE_SPAN;
        x += RECYCLE_SPAN;
      }
      const g = groups.current[i];
      if (g) g.position.x = x;
    });
  });

  return (
    <group>
      {slots.map((slot, i) => (
        <group
          key={slot.id}
          ref={(g) => {
            groups.current[i] = g;
          }}
          position={[slot.worldX, 0, slot.z]}
          rotation-y={slot.yaw}
          scale={SCENERY_SCALE}
        >
          <Clone object={scenes[slot.model] as Object3D} />
        </group>
      ))}
    </group>
  );
}
