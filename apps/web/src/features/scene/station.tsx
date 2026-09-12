import { useFrame } from "@react-three/fiber";
import { type RefObject, useRef } from "react";
import { BoxGeometry, type Group, MeshStandardMaterial } from "three";
import { STATION_DEPTH } from "./constants";
import type { LaneMotion } from "./motion";

type StationProps = { motion: RefObject<LaneMotion>; worldX: number; terminus: boolean };

// Every station is the same handful of boxes, so they are built once here and
// shared by all of them rather than rebuilt per station. Module-level and
// never disposed, which is right for something that lives as long as the app.
const DECK = new BoxGeometry(9, 0.7, 1.2);
const POST = new BoxGeometry(0.16, 2.4, 0.16);
const ROOF = new BoxGeometry(9.4, 0.18, 1.4);
const SIGN = new BoxGeometry(2.2, 0.5, 0.05);
const BUFFER = new BoxGeometry(0.4, 0.9, 1.2);

const DECK_MATERIAL = new MeshStandardMaterial({ color: "#d6d3d1" });
const POST_MATERIAL = new MeshStandardMaterial({ color: "#57534e" });
const SIGN_MATERIAL = new MeshStandardMaterial({ color: "#fafaf9" });
const BUFFER_MATERIAL = new MeshStandardMaterial({ color: "#292524" });
const ROOF_MATERIAL = new MeshStandardMaterial({ color: "#b45309" });
const TERMINUS_ROOF_MATERIAL = new MeshStandardMaterial({ color: "#7f1d1d" });

const POST_XS = [-3.5, 0, 3.5];

// A platform behind the track, built from primitives. The train's origin
// lines up with the platform centre when it stops. The deck's front edge sits
// clear of the train's 0.71 m half-width. Terminus stations get a buffer stop
// and a darker roof.
export function Station({ motion, worldX, terminus }: StationProps) {
  const group = useRef<Group>(null);

  useFrame(() => {
    if (group.current) group.current.position.x = worldX - motion.current.scroll;
  });

  return (
    <group ref={group} position={[worldX, 0, STATION_DEPTH]} scale-z={-1}>
      <mesh geometry={DECK} material={DECK_MATERIAL} position={[0, 0.35, 0]} />
      {POST_XS.map((x) => (
        <mesh key={x} geometry={POST} material={POST_MATERIAL} position={[x, 1.9, -0.4]} />
      ))}
      <mesh
        geometry={ROOF}
        material={terminus ? TERMINUS_ROOF_MATERIAL : ROOF_MATERIAL}
        position={[0, 3.2, -0.2]}
      />
      <mesh geometry={SIGN} material={SIGN_MATERIAL} position={[0, 2.35, -0.75]} />
      {terminus ? (
        <mesh geometry={BUFFER} material={BUFFER_MATERIAL} position={[2.2, 0.85, STATION_DEPTH]} />
      ) : null}
    </group>
  );
}
