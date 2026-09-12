import { Clone, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type RefObject, useRef } from "react";
import type { Group } from "three";
import {
  RECYCLE_SPAN,
  SCENERY_MAX_DEPTH,
  SCENERY_MIN_DEPTH,
  SCENERY_PER_LANE,
  SCENERY_SCALE,
  STATION_CLEARANCE,
  VISIBLE_HALF_WIDTH,
} from "./constants";
import { MODELS } from "./models";
import { type LaneMotion, wrapWorldX } from "./motion";

type SceneryProps = { motion: RefObject<LaneMotion>; stationXs: readonly number[] };

type Slot = {
  id: string;
  model: number;
  worldX: number;
  z: number;
  yaw: number;
  hidden: boolean;
};

function makeSlots(): Slot[] {
  return Array.from({ length: SCENERY_PER_LANE }, (_, i) => ({
    id: `slot-${i}`,
    model: Math.floor(Math.random() * MODELS.scenery.length),
    worldX: -VISIBLE_HALF_WIDTH + Math.random() * RECYCLE_SPAN,
    z: SCENERY_MIN_DEPTH + Math.random() * (SCENERY_MAX_DEPTH - SCENERY_MIN_DEPTH),
    yaw: Math.random() * Math.PI * 2,
    hidden: false,
  }));
}

// A fixed pool of trees and rocks behind the track. Each slot keeps a world x
// and jumps forward by RECYCLE_SPAN once it scrolls out of view. A slot that a
// station lands on hides until it recycles, so nothing pops into view on the
// platform.
export function Scenery({ motion, stationXs }: SceneryProps) {
  // useGLTF accepts an array and returns one GLTF per URL, in order.
  const scenes = useGLTF([...MODELS.scenery]).map((gltf) => gltf.scene);
  const slots = useRef<Slot[] | null>(null);
  if (slots.current === null) slots.current = makeSlots();
  const pool = slots.current;
  const groups = useRef<(Group | null)[]>([]);

  useFrame(() => {
    const current = slots.current;
    if (!current) return;
    const scroll = motion.current.scroll;
    current.forEach((slot, i) => {
      const before = slot.worldX;
      slot.worldX = wrapWorldX(slot.worldX, scroll, -VISIBLE_HALF_WIDTH, RECYCLE_SPAN);
      if (slot.worldX !== before) slot.hidden = false;
      if (!slot.hidden && stationXs.some((sx) => Math.abs(slot.worldX - sx) < STATION_CLEARANCE)) {
        slot.hidden = true;
      }
      const g = groups.current[i];
      if (g) {
        g.position.x = slot.worldX - scroll;
        g.visible = !slot.hidden;
      }
    });
  });

  return (
    <group>
      {pool.map((slot, i) => {
        const scene = scenes[slot.model];
        if (!scene) return null;
        return (
          <group
            key={slot.id}
            ref={(g) => {
              groups.current[i] = g;
            }}
            position={[slot.worldX, 0, slot.z]}
            rotation-y={slot.yaw}
            scale={SCENERY_SCALE}
          >
            <Clone object={scene} />
          </group>
        );
      })}
    </group>
  );
}
