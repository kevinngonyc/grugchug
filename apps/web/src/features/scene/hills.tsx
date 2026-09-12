import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { useWorld } from "@/features/world";
import { HILL_DEPTH, HILL_PARALLAX, RECYCLE_SPAN, VISIBLE_HALF_WIDTH } from "./constants";
import { getMotion } from "./motion";

const HILLS = [
  { id: "hill-a", x: -30, r: 14, color: "#7fb069" },
  { id: "hill-b", x: -8, r: 18, color: "#6a9c5b" },
  { id: "hill-c", x: 16, r: 12, color: "#7fb069" },
  { id: "hill-d", x: 36, r: 16, color: "#6a9c5b" },
];
const HILL_SPAN = RECYCLE_SPAN * 2;

// Big flat-shaded domes far behind every lane. They parallax off the local
// train so the world clearly stops when you do.
export function Hills() {
  const localTrainId = useWorld((s) => s.localTrainId);
  const groups = useRef<(Group | null)[]>([]);
  const worldX = useRef(HILLS.map((h) => h.x));

  useFrame(() => {
    const motion = localTrainId === null ? undefined : getMotion(localTrainId);
    const scroll = (motion?.scroll ?? 0) * HILL_PARALLAX;
    HILLS.forEach((_, i) => {
      let x = (worldX.current[i] ?? 0) - scroll;
      if (x < -VISIBLE_HALF_WIDTH * 2) {
        worldX.current[i] = (worldX.current[i] ?? 0) + HILL_SPAN;
        x += HILL_SPAN;
      }
      const g = groups.current[i];
      if (g) g.position.x = x;
    });
  });

  return (
    <group position={[0, -4, HILL_DEPTH]}>
      {HILLS.map((h, i) => (
        <group
          key={h.id}
          ref={(g) => {
            groups.current[i] = g;
          }}
          position-x={h.x}
        >
          <mesh>
            <sphereGeometry args={[h.r, 12, 8]} />
            <meshStandardMaterial color={h.color} flatShading />
          </mesh>
        </group>
      ))}
      <mesh rotation-x={-Math.PI / 2} position-y={4}>
        <planeGeometry args={[400, 120]} />
        <meshStandardMaterial color="#9bc47f" />
      </mesh>
    </group>
  );
}
