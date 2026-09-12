import { Clone, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useRef } from "react";
import type { Group, Object3D } from "three";
import { CARRIAGE_GAP, KIT_ROTATION_Y, TRAIN_Y, WHEEL_RADIUS } from "./constants";
import { MODELS } from "./models";
import type { LaneMotion } from "./motion";
import { Smoke } from "./smoke";

type TrainProps = { trainId: string; motion: RefObject<LaneMotion> };

// Locomotive at the lane origin, one carriage behind it. Faces +x. Wheel
// nodes in the Kenney models are named "wheel" or "wheels-*"; they spin about
// their local x, the axle.
export function Train({ motion }: TrainProps) {
  const locomotive = useGLTF(MODELS.locomotive);
  const carriage = useGLTF(MODELS.carriage);
  const root = useRef<Group>(null);
  const wheels = useRef<Object3D[]>([]);

  useEffect(() => {
    const found: Object3D[] = [];
    root.current?.traverse((o) => {
      if (o.name.startsWith("wheel")) found.push(o);
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
    </group>
  );
}
