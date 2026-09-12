import { useFrame } from "@react-three/fiber";
import { type RefObject, useRef } from "react";
import type { Group } from "three";
import { STATION_DEPTH } from "./constants";
import type { LaneMotion } from "./motion";

type StationProps = { motion: RefObject<LaneMotion>; worldX: number; terminus: boolean };

// A platform behind the track, built from primitives. The train's origin
// lines up with the platform centre when it stops. The deck's front edge sits
// clear of the train's 0.71 m half-width. Terminus stations get a buffer stop
// and a darker roof.
export function Station({ motion, worldX, terminus }: StationProps) {
  const group = useRef<Group>(null);

  useFrame(() => {
    if (group.current) group.current.position.x = worldX - motion.current.scroll;
  });

  const roof = terminus ? "#7f1d1d" : "#b45309";
  return (
    <group ref={group} position={[worldX, 0, STATION_DEPTH]} scale-z={-1}>
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[9, 0.7, 1.2]} />
        <meshStandardMaterial color="#d6d3d1" />
      </mesh>
      {[-3.5, 0, 3.5].map((x) => (
        <mesh key={x} position={[x, 1.9, -0.4]}>
          <boxGeometry args={[0.16, 2.4, 0.16]} />
          <meshStandardMaterial color="#57534e" />
        </mesh>
      ))}
      <mesh position={[0, 3.2, -0.2]}>
        <boxGeometry args={[9.4, 0.18, 1.4]} />
        <meshStandardMaterial color={roof} />
      </mesh>
      <mesh position={[0, 2.35, -0.75]}>
        <boxGeometry args={[2.2, 0.5, 0.05]} />
        <meshStandardMaterial color="#fafaf9" />
      </mesh>
      {terminus ? (
        <mesh position={[2.2, 0.85, STATION_DEPTH]}>
          <boxGeometry args={[0.4, 0.9, 1.2]} />
          <meshStandardMaterial color="#292524" />
        </mesh>
      ) : null}
    </group>
  );
}
