import { useFrame } from "@react-three/fiber";
import { type RefObject, useRef } from "react";
import { type InstancedMesh, Object3D } from "three";
import { CHIMNEY_OFFSET, SMOKE_LIFE, SMOKE_PUFFS } from "./constants";
import type { LaneMotion } from "./motion";

type SmokeProps = { motion: RefObject<LaneMotion> };

type Puff = { age: number; alive: boolean; drift: number };

// Scratch for composing instance matrices. One per module, reused every frame
// by every train: it never outlives a single synchronous loop.
const placer = new Object3D();

// A small pool of puffs, drawn as one instanced mesh. Spawn rate follows
// speed, so a stopped train is quiet.
//
// Every train has a pool, so one mesh per puff meant a geometry, a material
// and a draw call each — seventy of each across a full line, all of them
// transparent and all of them lit. They are one draw call per train now, and
// the material is unlit: smoke this pale under ambient 0.8 was never picking
// up shading worth the per-fragment cost.
export function Smoke({ motion }: SmokeProps) {
  const puffs = useRef<Puff[]>(
    Array.from({ length: SMOKE_PUFFS }, () => ({ age: 0, alive: false, drift: 0 })),
  );
  const mesh = useRef<InstancedMesh>(null);
  const sinceSpawn = useRef(0);

  useFrame((_, dt) => {
    const instanced = mesh.current;
    if (!instanced) return;

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

    for (let i = 0; i < puffs.current.length; i++) {
      const puff = puffs.current[i];
      if (!puff) continue;
      if (puff.alive) {
        puff.age += dt;
        if (puff.age > SMOKE_LIFE) puff.alive = false;
      }

      if (puff.alive) {
        const t = puff.age / SMOKE_LIFE;
        placer.position.set(-t * speed * 0.6 + puff.drift, t * 1.8, 0);
        placer.scale.setScalar(0.15 + t * 0.45);
      } else {
        // Scaled to nothing rather than hidden: the pool is one draw call, so
        // there is no per-puff visibility left to switch off.
        placer.position.set(0, 0, 0);
        placer.scale.setScalar(0);
      }
      placer.updateMatrix();
      instanced.setMatrixAt(i, placer.matrix);
    }
    instanced.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, SMOKE_PUFFS]}
      position={CHIMNEY_OFFSET}
      // The instances move every frame and never leave the chimney. Culling
      // them honestly would mean recomputing the bounds each frame, which
      // costs more than the single draw call it could save.
      frustumCulled={false}
    >
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color="#eeeeee" transparent opacity={0.6} depthWrite={false} />
    </instancedMesh>
  );
}
