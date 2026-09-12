import { Clone, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type RefObject, Suspense, useEffect, useRef } from "react";
import type { Group, Object3D } from "three";
import { useWorld } from "@/features/world";
import { Character } from "./character";
import {
  CARRIAGE_GAP,
  CONDUCTOR_OFFSET,
  CONDUCTOR_SPRITE_URL,
  KIT_ROTATION_Y,
  TRAIN_Y,
  WHEEL_RADIUS,
} from "./constants";
import { MODELS } from "./models";
import type { LaneMotion } from "./motion";
import { Smoke } from "./smoke";

type TrainProps = { trainId: string; motion: RefObject<LaneMotion> };

// Locomotive at the lane origin, one carriage behind it. Faces +x. Only the
// individual "wheel" nodes spin about local x; the "wheels-*" nodes are whole
// bogies (two axles and a frame in one mesh) and would tumble if rotated.
export function Train({ trainId, motion }: TrainProps) {
  const spriteUrl = useWorld((s) => s.trains[trainId]?.owner.spriteUrl);
  const locomotive = useGLTF(MODELS.locomotive);
  const carriage = useGLTF(MODELS.carriage);
  const root = useRef<Group>(null);
  const wheels = useRef<Object3D[]>([]);

  useEffect(() => {
    const found: Object3D[] = [];
    root.current?.traverse((o) => {
      if (/^wheel(?:_\d+)?$/.test(o.name)) found.push(o);
    });
    wheels.current = found;
  }, []);

  useFrame((_, dt) => {
    const spin = (motion.current.speed * dt) / WHEEL_RADIUS;
    for (const w of wheels.current) w.rotation.x += spin;
  });

  return (
    <group ref={root} position-y={TRAIN_Y}>
      <group rotation-y={KIT_ROTATION_Y}>
        <Clone object={locomotive.scene} />
      </group>
      <group position-x={-CARRIAGE_GAP} rotation-y={KIT_ROTATION_Y}>
        <Clone object={carriage.scene} />
      </group>
      <Smoke motion={motion} />
      <Suspense fallback={null}>
        <Character url={CONDUCTOR_SPRITE_URL} position={CONDUCTOR_OFFSET} trainId={trainId} />
      </Suspense>
      {spriteUrl ? (
        <Suspense fallback={null}>
          <Character url={spriteUrl} />
        </Suspense>
      ) : null}
    </group>
  );
}
