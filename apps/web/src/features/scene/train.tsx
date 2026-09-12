import { Clone, useGLTF } from "@react-three/drei";
import type { RefObject } from "react";
import { CARRIAGE_GAP, KIT_ROTATION_Y, TRAIN_Y } from "./constants";
import { MODELS } from "./models";
import type { LaneMotion } from "./motion";

type TrainProps = { trainId: string; motion: RefObject<LaneMotion> };

// Locomotive at the lane origin, one carriage behind it. Faces +x.
export function Train(_props: TrainProps) {
  const locomotive = useGLTF(MODELS.locomotive);
  const carriage = useGLTF(MODELS.carriage);
  return (
    <group position-y={TRAIN_Y}>
      <group rotation-y={KIT_ROTATION_Y}>
        <Clone object={locomotive.scene} />
      </group>
      <group position-x={-CARRIAGE_GAP} rotation-y={KIT_ROTATION_Y}>
        <Clone object={carriage.scene} />
      </group>
    </group>
  );
}
