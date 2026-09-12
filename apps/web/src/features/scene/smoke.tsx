import { useFrame } from "@react-three/fiber";
import { type RefObject, useRef } from "react";
import type { Mesh } from "three";
import { CHIMNEY_OFFSET, SMOKE_LIFE, SMOKE_PUFFS } from "./constants";
import type { LaneMotion } from "./motion";

type SmokeProps = { motion: RefObject<LaneMotion> };

type Puff = { id: string; age: number; alive: boolean; drift: number };

// A small pool of puffs. Spawn rate follows speed, so a stopped train is quiet.
export function Smoke({ motion }: SmokeProps) {
  const puffs = useRef<Puff[]>(
    Array.from({ length: SMOKE_PUFFS }, (_, i) => ({
      id: `puff-${i}`,
      age: 0,
      alive: false,
      drift: 0,
    })),
  );
  const meshes = useRef<(Mesh | null)[]>([]);
  const sinceSpawn = useRef(0);

  useFrame((_, dt) => {
    const speed = motion.current.speed;
    sinceSpawn.current += dt;
    const interval = speed > 0.2 ? 1.2 / speed : Number.POSITIVE_INFINITY;
    if (sinceSpawn.current > interval) {
      sinceSpawn.current = 0;
      const free = puffs.current.find((p) => !p.alive);
      if (free) {
        free.alive = true;
        free.age = 0;
        free.drift = (Math.random() - 0.5) * 0.4;
      }
    }
    puffs.current.forEach((p, i) => {
      const mesh = meshes.current[i];
      if (!mesh) return;
      if (!p.alive) {
        mesh.visible = false;
        return;
      }
      p.age += dt;
      if (p.age > SMOKE_LIFE) {
        p.alive = false;
        mesh.visible = false;
        return;
      }
      const t = p.age / SMOKE_LIFE;
      mesh.visible = true;
      mesh.position.set(-t * speed * 0.6 + p.drift, t * 1.8, 0);
      const s = 0.15 + t * 0.45;
      mesh.scale.set(s, s, s);
    });
  });

  return (
    <group position={CHIMNEY_OFFSET}>
      {puffs.current.map((p, i) => (
        <mesh
          key={p.id}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          visible={false}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color="#eeeeee" transparent opacity={0.6} />
        </mesh>
      ))}
    </group>
  );
}
